import { afterAll, beforeAll, describe, test } from 'bun:test';
import type { Page, Browser as PuppeteerBrowser } from 'puppeteer-core';
import type { Browser } from './browser';
import { getBrowser } from './browser';
import { searchGoogle } from './google';

// These are real integration tests that require network access and Playwright browsers
// Run with: RUN_NETWORK_TESTS=true bun test src/websearch/google.integration.test.ts
const shouldRun = process.env.RUN_NETWORK_TESTS === 'true';

(shouldRun ? describe : describe.skip)('google integration tests', () => {
  let browserInstance: Browser | null = null;
  let browser: PuppeteerBrowser | null = null;
  let googlePage: Page | null = null;

  beforeAll(async () => {
    browserInstance = await getBrowser({
      executablePath: '.devbox/nix/profile/default/bin/chromium',
      headless: false,
    });
    browser = browserInstance.getPuppeteerBrowser();
    googlePage = await browser.newPage();
  }, 40000);

  afterAll(async () => {
    if (browserInstance) {
      await browserInstance.cleanup();
    }
  });

  test('respects limit parameter', async () => {
    if (!googlePage) throw new Error('Page is required');

    const results = await searchGoogle(
      'opencode plugins',
      {
        timeout: 30000,
        locale: 'en-US',
      },
      googlePage,
    );

    console.log(`Got ${results.length} Google results`);
    console.debug(results);
  }, 40000);
});
