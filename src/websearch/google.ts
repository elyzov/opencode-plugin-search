import type { Page } from 'puppeteer-core';
import type { GoogleSearchOptions, SearchEngineResult } from './types';

export async function searchGoogle(
  query: string,
  options: GoogleSearchOptions,
  page: Page,
): Promise<Omit<SearchEngineResult, 'source' | 'rank'>[]> {
  try {
    // Set viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });

    // URL encode the query
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://google.com/search?q=${encodedQuery}`;

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: options.timeout });

    // Check for CAPTCHA using multiple detection methods
    const hasRecaptchaIframe = await page.$('iframe[title="reCAPTCHA"]');
    if (hasRecaptchaIframe) {
      throw new Error('Google CAPTCHA detected. Try enabling headless: false or using a different IP.');
    }

    // Extract results using simplified approach
    const results = await page.evaluate(() => {
      // Extracts the snippet text from a Google search result item.
      function getSnippetFromAnchor(anchor: HTMLAnchorElement) {
        // Heuristic: an element likely contains the main snippet if its text is
        // longer than 20 characters, contains spaces (multiple words), and has few links.
        function isLikelySnippet(elem: Element) {
          const text = elem.textContent.trim();
          if (text.length <= 20 || !text.includes(' ')) return false;
          const links = elem.querySelectorAll('a');
          // Main snippet usually has 0–1 links (e.g., "Read more"), while sitelinks containers have many.
          return links.length <= 2;
        }

        // Walk up the DOM starting from the anchor
        let current: HTMLElement = anchor;
        while (current) {
          const parent = current.parentElement;
          if (!parent) break;

          const children = Array.from(parent.children);
          if (children.length >= 2) {
            // Identify the title block that contains the anchor
            const titleBlock = children.find((child) => child.contains(anchor));
            if (titleBlock) {
              // Examine siblings after the title block
              let sibling: Element | null = titleBlock.nextElementSibling;
              while (sibling) {
                // 1. Check if the sibling itself is the snippet container
                if (isLikelySnippet(sibling)) {
                  return sibling.textContent.trim();
                }
                // 2. Look deeper for a descendant that holds the snippet
                const descendants = Array.from(sibling.querySelectorAll('*'));
                for (const el of descendants) {
                  if (isLikelySnippet(el)) {
                    return el.textContent.trim();
                  }
                }
                sibling = sibling.nextElementSibling;
              }
            }
          }
          current = parent;
        }
        return null; // No snippet found
      }

      return Array.from(document.querySelectorAll('a'))
        .filter((a) => {
          const hasH3 = a.querySelector('h3');
          const hasValidHref = a.href && (a.href.startsWith('http') || a.href.includes('/url?'));
          return hasH3 && hasValidHref;
        })
        .map((a) => {
          let link = a.href;
          // Extract actual URL from Google's redirect links
          if (link.includes('/url?')) {
            const urlMatch = link.match(/[?&]url=([^&]+)/);
            if (urlMatch?.[1]) {
              link = decodeURIComponent(urlMatch[1]);
            }
          }
          const h3 = a.querySelector('h3');
          const title = h3 ? (h3.textContent || '').trim() : '';
          const snippet = getSnippetFromAnchor(a) || '';

          return { title, link, snippet };
        })
        .filter(
          (result) =>
            result.link &&
            result.snippet &&
            !result.link.includes('google.com/search') &&
            !result.link.includes('google.com/preferences'),
        );
    });

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages
    if (errorMsg.includes('No browser executable found')) {
      console.error(
        `${errorMsg}\n\n` +
          'Google search requires a browser. Options:\n' +
          '1. Use DuckDuckGo instead (no browser required)\n' +
          '2. Install Chrome/Chromium on your system\n' +
          '3. Use a remote browser instance (see README)\n' +
          '4. Use Docker with pre-installed browser (see README)',
      );
    }

    if (errorMsg.includes('Failed to launch')) {
      console.error(
        `${errorMsg}\n\n` +
          'Google search failed to start browser. Try:\n' +
          '1. Install missing system libraries (see error above)\n' +
          '2. Use browser_ws_endpoint to connect to existing browser\n' +
          '3. Use DuckDuckGo instead (no browser required)',
      );
    }

    console.error(`Google search failed: ${errorMsg}`);
    return [];
  }
}
