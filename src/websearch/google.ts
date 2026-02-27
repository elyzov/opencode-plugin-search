import type { Browser, ElementHandle } from 'puppeteer-core';
import type { GoogleSearchOptions, SearchEngineResult } from './types';

export async function searchGoogle(
  query: string,
  options: GoogleSearchOptions,
  browser: Browser,
): Promise<Omit<SearchEngineResult, 'source' | 'rank'>[]> {
  try {
    // Create new browser page
    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // Anti-detection script
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

      // @ts-expect-error
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {},
      };
    });

    // Navigate to Google
    const googleDomain = options.country
      ? `https://www.google.${options.country.toLowerCase()}`
      : 'https://www.google.com';

    await page.goto(googleDomain, { waitUntil: 'networkidle0', timeout: options.timeout });

    // Check for CAPTCHA
    const currentUrl = page.url();
    if (currentUrl.includes('sorry') || currentUrl.includes('captcha') || currentUrl.includes('recaptcha')) {
      throw new Error('Google CAPTCHA detected. Try enabling headless: false or using a different IP.');
    }

    // Find and fill search box
    const searchInput = await page.waitForSelector('textarea[name="q"], input[name="q"]', {
      timeout: options.timeout / 2,
    });
    if (!searchInput) {
      throw new Error(
        'Google search box not found. The page structure may have changed or Google is blocking the request.',
      );
    }
    // Cast to ElementHandle<Element> to avoid TypeScript union issues
    const input = searchInput as ElementHandle<Element>;
    await input.click();
    await input.type(query);
    await input.press('Enter');

    // Wait for results
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: options.timeout });

    // Check for CAPTCHA again
    const searchUrl = page.url();
    if (searchUrl.includes('sorry') || searchUrl.includes('captcha') || searchUrl.includes('recaptcha')) {
      throw new Error('Google CAPTCHA detected after search. Try enabling headless: false or using a different IP.');
    }

    // Extract results - based on robust extraction from .examples/google-search
    const results = await page.evaluate((limit: number) => {
      const extracted: Array<{ title: string; link: string; snippet: string }> = [];
      const seenUrls = new Set<string>();

      // Multiple selector sets with fallbacks, ordered by priority
      const selectorSets = [
        { container: '#search div[data-hveid]', title: 'h3', snippet: 'div[role="text"]' },
        { container: '#rso div[data-hveid]', title: 'h3', snippet: 'div[style*="webkit-line-clamp"]' },
        { container: '.g', title: 'h3', snippet: 'div' },
        { container: 'div[jscontroller][data-hveid]', title: 'h3', snippet: 'div[role="text"]' },
      ];

      // Alternative snippet selectors
      const alternativeSnippetSelectors = ['div[role="text"]', 'div[style*="webkit-line-clamp"]', 'div'];

      // Try each selector set
      for (const selectors of selectorSets) {
        if (extracted.length >= limit) break;

        const containers = Array.from(document.querySelectorAll(selectors.container));

        for (const container of containers) {
          if (extracted.length >= limit) break;

          const titleElement = container.querySelector(selectors.title);
          if (!titleElement) continue;

          const title = (titleElement.textContent || '').trim();

          // Find link - multiple strategies
          let link = '';
          const linkInTitle = titleElement.querySelector('a');
          if (linkInTitle) {
            link = linkInTitle.href;
          } else {
            // Walk up the DOM to find link
            let current: Element | null = titleElement;
            while (current && current.tagName !== 'A') {
              current = current.parentElement;
            }
            if (current && current instanceof HTMLAnchorElement) {
              link = current.href;
            } else {
              const containerLink = container.querySelector('a');
              if (containerLink) {
                link = containerLink.href;
              }
            }
          }

          // Filter invalid or duplicate links
          if (!link || !link.startsWith('http') || seenUrls.has(link)) continue;

          // Find snippet
          let snippet = '';
          const snippetElement = container.querySelector(selectors.snippet);
          if (snippetElement) {
            snippet = (snippetElement.textContent || '').trim();
          } else {
            // Try alternative selectors
            for (const altSelector of alternativeSnippetSelectors) {
              const element = container.querySelector(altSelector);
              if (element) {
                snippet = (element.textContent || '').trim();
                break;
              }
            }

            // Generic fallback for snippet
            if (!snippet) {
              const textNodes = Array.from(container.querySelectorAll('div')).filter(
                (el) => !el.querySelector('h3') && (el.textContent || '').trim().length > 20,
              );
              if (textNodes.length > 0) {
                snippet = (textNodes[0]?.textContent || '').trim();
              }
            }
          }

          if (title && link) {
            extracted.push({ title, link, snippet });
            seenUrls.add(link);
          }
        }
      }

      // Generic fallback if we don't have enough results
      if (extracted.length < limit) {
        const anchorElements = Array.from(document.querySelectorAll("a[href^='http']"));
        for (const el of anchorElements) {
          if (extracted.length >= limit) break;

          if (!(el instanceof HTMLAnchorElement)) continue;

          const link = el.href;
          // Filter Google internal links and duplicates
          if (
            !link ||
            seenUrls.has(link) ||
            link.includes('google.com/') ||
            link.includes('accounts.google') ||
            link.includes('support.google')
          ) {
            continue;
          }

          const title = (el.textContent || '').trim();
          if (!title) continue;

          // Find snippet from surrounding text
          let snippet = '';
          let parent = el.parentElement;
          for (let i = 0; i < 3 && parent; i++) {
            const text = (parent.textContent || '').trim();
            if (text.length > 20 && text !== title) {
              snippet = text;
              break;
            }
            parent = parent.parentElement;
          }

          extracted.push({ title, link, snippet });
          seenUrls.add(link);
        }
      }

      return extracted.slice(0, limit);
    }, options.limit);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages
    if (errorMsg.includes('No browser executable found')) {
      throw new Error(
        `${errorMsg}\n\n` +
          'Google search requires a browser. Options:\n' +
          '1. Use DuckDuckGo instead (no browser required)\n' +
          '2. Install Chrome/Chromium on your system\n' +
          '3. Use a remote browser instance (see README)\n' +
          '4. Use Docker with pre-installed browser (see README)',
      );
    }

    if (errorMsg.includes('Failed to launch')) {
      throw new Error(
        `${errorMsg}\n\n` +
          'Google search failed to start browser. Try:\n' +
          '1. Install missing system libraries (see error above)\n' +
          '2. Use browser_ws_endpoint to connect to existing browser\n' +
          '3. Use DuckDuckGo instead (no browser required)',
      );
    }

    throw new Error(`Google search failed: ${errorMsg}`);
  }
}
