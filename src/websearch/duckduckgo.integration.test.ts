import { describe, expect, test } from 'bun:test';
import { searchDuckDuckGo } from './duckduckgo';

// These are real integration tests that require network access
// Run with: RUN_NETWORK_TESTS=true bun test src/websearch/duckduckgo.integration.test.ts
const shouldRun = process.env.RUN_NETWORK_TESTS === 'true';

(shouldRun ? describe : describe.skip)('duckduckgo integration tests', () => {
  test('returns search results for common query', async () => {
    const results = await searchDuckDuckGo('hello world', {
      limit: 5,
      timeout: 10000,
      locale: 'en-US',
    });

    // DuckDuckGo should return some results
    expect(results.length).toBeGreaterThan(0);

    // Each result should have title and link
    results.forEach((result) => {
      expect(result.title).toBeTruthy();
      expect(result.link).toBeTruthy();
      expect(result.link).toMatch(/^https?:\/\//);
    });

    console.log(`Found ${results.length} DuckDuckGo results for "hello world"`);
    if (results.length > 0) {
      console.log(`First result: ${results[0]?.title} - ${results[0]?.link}`);
    }
  });

  test('respects limit parameter', async () => {
    const limit = 3;
    const results = await searchDuckDuckGo('typescript programming language', {
      limit,
      timeout: 10000,
      locale: 'en-US',
    });

    // Should not return more than limit
    expect(results.length).toBeLessThanOrEqual(limit);

    if (results.length > 0) {
      console.log(`Got ${results.length} results with limit=${limit}`);
    }
  });

  test('handles empty results for obscure query', async () => {
    const results = await searchDuckDuckGo(
      'xysdfg12345nonexistentquery12345', // Very unlikely to have results
      {
        limit: 5,
        timeout: 10000,
        locale: 'en-US',
      },
    );

    // It's okay to have 0 results for obscure queries
    console.log(`Got ${results.length} results for obscure query`);

    // If there are results, they should be valid
    results.forEach((result) => {
      expect(result.title).toBeTruthy();
      expect(result.link).toBeTruthy();
      expect(result.link).toMatch(/^https?:\/\//);
    });
  });
});
