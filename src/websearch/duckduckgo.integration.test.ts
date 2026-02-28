import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Page, Browser as PuppeteerBrowser } from 'puppeteer-core';
import type { Browser } from './browser';
import { getBrowser } from './browser';
import { searchDuckDuckGo } from './duckduckgo';

// These are real integration tests that require network access and Playwright browsers
// Run with: RUN_NETWORK_TESTS=true bun test src/websearch/duckduckgo.integration.test.ts
const shouldRun = process.env.RUN_NETWORK_TESTS === 'true';

(shouldRun ? describe : describe.skip)('duckduckgo integration tests', () => {
  let browserInstance: Browser | null = null;
  let browser: PuppeteerBrowser | null = null;
  let duckduckgoPage: Page | null = null;

  beforeAll(async () => {
    browserInstance = await getBrowser({
      executablePath: '.devbox/nix/profile/default/bin/chromium',
      headless: false,
    });
    browser = browserInstance.getPuppeteerBrowser();
    duckduckgoPage = await browser.newPage();
  }, 40000);

  afterAll(async () => {
    if (browserInstance) {
      await browserInstance.cleanup();
    }
  });

  test('respects limit parameter', async () => {
    if (!duckduckgoPage) throw new Error('Page is required');

    const limit = 5;
    const results = await searchDuckDuckGo(
      'opencode plugins',
      {
        limit,
        timeout: 30000,
        locale: 'en-US',
      },
      duckduckgoPage,
    );

    // Should not return more than limit
    expect(results.length).toBeLessThanOrEqual(limit);

    console.log(`Got ${results.length} DuckDuckGo results with limit=${limit}`);
    console.debug(results);
  }, 40000);
});
