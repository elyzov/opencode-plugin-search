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
    const results = await page.evaluate((limit: number) => {
      const extracted: Array<{ title: string; link: string }> = [];
      const seenUrls = new Set<string>();

      // Strategy 1: Find links that contain h3 elements (main search results)
      const resultLinks = Array.from(document.querySelectorAll('a')).filter((a) => {
        return a.querySelector('h3') && a.href && a.href.startsWith('http');
      });

      for (const linkEl of resultLinks) {
        if (extracted.length >= limit) break;

        const link = linkEl.href;
        if (!link || seenUrls.has(link) || link.includes('google.com/')) continue;

        const titleEl = linkEl.querySelector('h3');
        const title = titleEl ? (titleEl.textContent || '').trim() : '';
        if (!title) continue;

        extracted.push({ title, link });
        seenUrls.add(link);
      }

      return extracted.slice(0, limit);
    }, options.limit);

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
