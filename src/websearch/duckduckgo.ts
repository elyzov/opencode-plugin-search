import type { Page } from 'puppeteer-core';
import type { DuckDuckGoSearchOptions, SearchEngineResult } from './types';

export async function searchDuckDuckGo(
  query: string,
  options: DuckDuckGoSearchOptions,
  page: Page,
): Promise<Omit<SearchEngineResult, 'source' | 'rank'>[]> {
  try {
    // Set viewport and user agent
    await page.setViewport({ width: 1366, height: 768 });

    // URL encode the query
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://duckduckgo.com/?q=${encodedQuery}`;

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: options.timeout });

    // Extract results using DuckDuckGo's HTML structure
    const results = await page.evaluate((limit: number) => {
      // DuckDuckGo search results are in <li> elements with data-layout="organic"
      const resultElements = Array.from(document.querySelectorAll('li[data-layout="organic"]'));

      return resultElements
        .map((li) => {
          // Find the title link - it's usually an <a> tag inside an <h2> or with specific class
          const titleLink = li.querySelector('a[data-testid="result-title-a"]') as HTMLAnchorElement;
          if (!titleLink || !titleLink.href) return null;

          const title = titleLink.textContent?.trim() || '';
          const link = titleLink.href;

          // Try to extract snippet/content
          let content = '';
          const snippetElement = li.querySelector('[data-result="snippet"]');
          if (snippetElement) {
            content = snippetElement.textContent?.trim() || '';
          }

          return { title, link, content };
        })
        .filter(
          (result): result is { title: string; link: string; content: string } =>
            result?.link.startsWith('http') || false,
        )
        .slice(0, limit);
    }, options.limit);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages
    if (errorMsg.includes('No browser executable found')) {
      console.error(
        `${errorMsg}\n\n` +
          'DuckDuckGo search requires a browser. Options:\n' +
          '1. Install Chrome/Chromium on your system\n' +
          '2. Use a remote browser instance (see README)\n' +
          '3. Use Docker with pre-installed browser (see README)',
      );
    }

    if (errorMsg.includes('Failed to launch')) {
      console.error(
        `${errorMsg}\n\n` +
          'DuckDuckGo search failed to start browser. Try:\n' +
          '1. Install missing system libraries (see error above)\n' +
          '2. Use browser_ws_endpoint to connect to existing browser\n',
      );
    }

    console.error(`DuckDuckGo search failed: ${errorMsg}`);
    return [];
  }
}
