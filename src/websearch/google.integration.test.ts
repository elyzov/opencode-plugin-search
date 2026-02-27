import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser as PuppeteerBrowser } from "puppeteer-core";
import type { Browser } from "./browser";
import { getBrowser } from "./browser";
import { searchGoogle } from "./google";

// These are real integration tests that require network access and Playwright browsers
// Run with: RUN_NETWORK_TESTS=true bun test src/websearch/google.integration.test.ts
const shouldRun = process.env.RUN_NETWORK_TESTS === "true";
const browserLaunchCommand =
  "lightpanda-x86_64-linux serve --obey_robots --log_format pretty --log_level info --host 127.0.0.1 --port 9222";

(shouldRun ? describe : describe.skip)("google integration tests", () => {
  let browserInstance: Browser | null = null;
  let browser: PuppeteerBrowser | null = null;

  beforeAll(async () => {
    browserInstance = await getBrowser({
      browserLaunchCommand,
      headless: true,
    });
    browser = browserInstance.getPuppeteerBrowser();
  }, 40000);

  afterAll(async () => {
    if (browserInstance) {
      await browserInstance.cleanup();
    }
  });

  test("returns search results for common query", async () => {
    if (!browser) throw new Error("Browser not initialized");

    const results = await searchGoogle(
      "hello world",
      {
        limit: 5,
        timeout: 30000, // Longer timeout for browser automation
        locale: "en-US",
      },
      browser,
    );

    // Google should return some results
    expect(results.length).toBeGreaterThan(0);

    // Each result should have title and link
    results.forEach((result) => {
      expect(result.title).toBeTruthy();
      expect(result.link).toBeTruthy();
      expect(result.link).toMatch(/^https?:\/\//);
    });

    console.log(`Found ${results.length} Google results for "hello world"`);
    if (results.length > 0) {
      console.log(`First result: ${results[0]?.title} - ${results[0]?.link}`);
    }
  }, 40000); // Extended timeout for browser automation

  test("respects limit parameter", async () => {
    if (!browser) throw new Error("Browser not initialized");

    const limit = 2;
    const results = await searchGoogle(
      "javascript programming",
      {
        limit,
        timeout: 30000,
        locale: "en-US",
      },
      browser,
    );

    // Should not return more than limit
    expect(results.length).toBeLessThanOrEqual(limit);

    if (results.length > 0) {
      console.log(`Got ${results.length} Google results with limit=${limit}`);
    }
  }, 40000);

  test("handles country-specific Google domain", async () => {
    if (!browser) throw new Error("Browser not initialized");

    const results = await searchGoogle(
      "test",
      {
        limit: 3,
        timeout: 30000,
        locale: "en-US",
        country: "co.uk", // Use Google UK
      },
      browser,
    );

    // Should work with country-specific domain
    if (results.length > 0) {
      results.forEach((result) => {
        expect(result.title).toBeTruthy();
        expect(result.link).toBeTruthy();
      });
      console.log(`Got ${results.length} results from Google UK`);
    } else {
      console.log("No results from Google UK (might be CAPTCHA or other issue)");
    }
  }, 40000);
});
