import { describe, expect, test } from 'bun:test';
import { fetchMultipleWebpagesToMarkdown } from './fetcher';

// These are real integration tests that require network access
// Run with: RUN_NETWORK_TESTS=true bun test src/websearch/fetcher.integration.test.ts
const shouldRun = process.env.RUN_NETWORK_TESTS === 'true';

(shouldRun ? describe : describe.skip)('fetcher integration tests', () => {
  // Test URLs from the user's example
  const testUrls = [
    'https://opencode.ai/docs/plugins/',
    'https://github.com/awesome-opencode/awesome-opencode',
    'https://www.opencode.cafe/',
    'https://open-code.ai/en/docs/plugins',
    'https://opencode.ai/docs/ecosystem/',
    'https://opencode.ai/docs/tools/',
    // Note: Some URLs from the example are duplicates, we include unique ones
  ];

  test('fetches multiple URLs in parallel and measures performance', async () => {
    const startTime = Date.now();

    const results = await fetchMultipleWebpagesToMarkdown(testUrls, {
      timeout: 30000,
    });

    const totalTime = Date.now() - startTime;

    console.log(`\n=== Fetcher Performance Test ===`);
    console.log(`Total URLs: ${testUrls.length}`);
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Average time per URL: ${totalTime / testUrls.length}ms`);

    // Log individual results
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.url}`);
      console.log(`   Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   Time: ${result.metadata.fetchTime}ms`);
      const title = result.title || 'No title';
      console.log(`   Title: ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`);
      console.log(`   Content length: ${result.length} chars`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // At least some URLs should succeed
    const successful = results.filter((r) => r.success);
    expect(successful.length).toBeGreaterThan(0);

    // Total time should be reasonable (less than sum of individual timeouts)
    // Since requests are parallel, total time should be close to the slowest request
    const maxFetchTime = Math.max(...results.map((r) => r.metadata.fetchTime));
    console.log(`\nMax individual fetch time: ${maxFetchTime}ms`);
    console.log(
      `Parallelism efficiency: ${totalTime < maxFetchTime * 1.5 ? 'GOOD' : 'POOR'} (total ${totalTime}ms vs max ${maxFetchTime}ms)`,
    );

    // Warn if total time is too long
    if (totalTime > 10000) {
      console.warn(`\n⚠️  WARNING: Total fetch time ${totalTime}ms exceeds 10 seconds`);
    }
  }, 60000); // 60 second timeout for the test

  test('respects timeout parameter', async () => {
    // Use a URL that will timeout quickly with a very short timeout
    const results = await fetchMultipleWebpagesToMarkdown(
      ['https://httpstat.us/200?sleep=5000'], // Simulates 5 second delay
      {
        timeout: 1000, // 1 second timeout
      },
    );

    const result = results[0];
    if (!result) {
      throw new Error('Expected at least one result');
    }

    expect(result.success).toBe(false);
    expect(result.error).toContain('closed');
  }, 10000);
});
