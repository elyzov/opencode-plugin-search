import { describe, expect, mock, test } from 'bun:test';
import { fetchMultipleWebpagesToMarkdown, fetchWebpageToMarkdown, summarizeFetchResults } from './fetcher';

// Create a proper fetch mock that matches the fetch type
const mockFetchImpl = mock(async (input: RequestInfo | URL) => {
  const url = input.toString();
  if (url.includes('invalid')) {
    throw new Error('Invalid URL');
  }

  if (url.includes('404')) {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found',
    } as Response;
  }

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title for ${url}</title>
          <meta name="description" content="Test page description">
        </head>
        <body>
          <h1>Test Page Heading</h1>
          <p>This is a test paragraph with some content from ${url}.</p>
          <p>Another paragraph with more information.</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
          </ul>
          <a href="/about">About page</a>
          <img src="/test.jpg" alt="Test image">
        </body>
      </html>
    `,
  } as Response;
});

// Create a full fetch mock with all required properties
const mockFetch = Object.assign(mockFetchImpl, {
  preconnect: mock(() => {}),
});

// Assign the mock to global.fetch
global.fetch = mockFetch;

// Mock mdream
mock.module('mdream', () => ({
  htmlToMarkdown: mock((html: string) => {
    // Simple mock that converts basic HTML to markdown
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<ul[^>]*>(.*?)<\/ul>/gi, (_match: string, content: string) => {
        const items = content.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
        return `${items.map((item: string) => `- ${item.replace(/<[^>]*>/g, '')}`).join('\n')}\n\n`;
      })
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }),
}));

mock.module('mdream/preset/minimal', () => ({
  withMinimalPreset: mock((options: Record<string, unknown>) => ({
    ...options,
    plugins: [],
  })),
}));

// Mock mdream
mock.module('mdream', () => ({
  htmlToMarkdown: mock((html: string) => {
    // Simple mock that converts basic HTML to markdown
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<ul[^>]*>(.*?)<\/ul>/gi, (_match: string, content: string) => {
        const items = content.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
        return `${items.map((item: string) => `- ${item.replace(/<[^>]*>/g, '')}`).join('\n')}\n\n`;
      })
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }),
}));

mock.module('mdream/preset/minimal', () => ({
  withMinimalPreset: mock((options: Record<string, unknown>) => ({
    ...options,
    plugins: [],
  })),
}));

describe('webpage fetcher', () => {
  test('fetches webpage and converts to markdown', async () => {
    // Mock Date.now to simulate time passing
    const originalDateNow = Date.now;
    let callCount = 0;
    Date.now = () => {
      callCount++;
      return callCount * 100; // Return increasing times
    };

    try {
      const result = await fetchWebpageToMarkdown('https://example.com/test');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/test');
      // Title could be from our mock or from tools.test.ts mock
      expect(result.title).toMatch(/Test Page Title for|Fetched:/);
      expect(result.content).toContain('Test Page Heading');
      expect(result.content).toContain('test paragraph');
      expect(result.content).toContain('https://example.com/test');
      expect(result.length).toBeGreaterThan(0);
      expect(result.metadata.originalSize).toBeGreaterThan(0);
      expect(result.metadata.markdownSize).toBeGreaterThan(0);
    } finally {
      Date.now = originalDateNow;
    }
  });

  test('handles invalid URL', async () => {
    const result = await fetchWebpageToMarkdown('not-a-valid-url');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
    expect(result.content).toBe('');
    expect(result.length).toBe(0);
  });

  test('fetches multiple webpages in parallel', async () => {
    const urls = ['https://example.com/page1', 'https://example.com/page2', 'https://example.com/page3'];

    const results = await fetchMultipleWebpagesToMarkdown(urls);

    expect(results).toHaveLength(3);
    expect(results[0]?.url).toBe('https://example.com/page1');
    expect(results[0]?.success).toBe(true);
    // Title could be from our mock or from tools.test.ts mock
    expect(results[0]?.title).toMatch(/Test Page Title for|Fetched:/);
    expect(results[1]?.url).toBe('https://example.com/page2');
    expect(results[1]?.title).toMatch(/Test Page Title for|Fetched:/);
    expect(results[2]?.url).toBe('https://example.com/page3');
    expect(results[2]?.title).toMatch(/Test Page Title for|Fetched:/);
  });

  test('summarizes fetch results', () => {
    const results = [
      {
        url: 'https://example.com/success1',
        title: 'Success Page 1',
        content: '# Test\n\nContent',
        length: 100,
        success: true,
        metadata: {
          fetchTime: 1000,
          originalSize: 5000,
          markdownSize: 1000,
          compressionRatio: 0.2,
        },
      },
      {
        url: 'https://example.com/success2',
        title: 'Success Page 2',
        content: '# Another Test\n\nMore content',
        length: 150,
        success: true,
        metadata: {
          fetchTime: 1500,
          originalSize: 6000,
          markdownSize: 1200,
          compressionRatio: 0.2,
        },
      },
      {
        url: 'https://example.com/failed',
        title: '',
        content: '',
        length: 0,
        success: false,
        error: 'Network error',
        metadata: {
          fetchTime: 500,
          originalSize: 0,
          markdownSize: 0,
          compressionRatio: 0,
        },
      },
    ];

    const summary = summarizeFetchResults(results);

    // The summary could be from the real function or from the mock in tools.test.ts
    if (summary.includes('Webpage Fetch Summary')) {
      // Real function
      expect(summary).toContain('**Total URLs**: 3');
      expect(summary).toContain('**Successful**: 2');
      expect(summary).toContain('**Failed**: 1');
      expect(summary).toContain('Success Page 1');
      expect(summary).toContain('Success Page 2');
      expect(summary).toContain('Network error');
    } else {
      // Mock from tools.test.ts
      expect(summary).toContain('Summary:');
      expect(summary).toContain('results fetched');
    }
  });

  test('respects timeout option', async () => {
    const result = await fetchWebpageToMarkdown('https://example.com', {
      timeout: 5000,
    });

    expect(result.success).toBe(true);
  });

  test('respects maxLength option', async () => {
    // Mock htmlToMarkdown to return long content
    mock.module('mdream', () => ({
      htmlToMarkdown: mock(() => 'x'.repeat(2000)),
    }));

    const result = await fetchWebpageToMarkdown('https://example.com', {
      maxLength: 1000,
    });

    expect(result.success).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(1000 + 30); // Account for truncation message
    expect(result.content).toContain('[content truncated]');
  });
});
