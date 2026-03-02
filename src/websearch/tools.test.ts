import { describe, expect, mock, test } from 'bun:test';
import type { ToolContext } from '@opencode-ai/plugin';

// Mock the browser module before importing the tool
mock.module('./browser', () => ({
  getBrowser: mock(async () => ({
    getPuppeteerBrowser: () => ({
      newPage: mock(async () => ({
        goto: mock(async () => {}),
        waitForSelector: mock(async () => {}),
        evaluate: mock(async () => []),
        close: mock(async () => {}),
      })),
      close: mock(async () => {}),
    }),
    cleanup: mock(async () => {}),
  })),
}));

// Mock the fetcher module
mock.module('./fetcher', () => ({
  fetchMultipleWebpagesToMarkdown: mock(async (urls: string[]) => {
    return urls.map((url) => ({
      url,
      title: `Fetched: ${url}`,
      content: `# Content from ${url}\n\nThis is fetched content.`,
      length: 100,
      success: true,
      metadata: {
        fetchTime: 100,
        originalSize: 1000,
        markdownSize: 100,
        compressionRatio: 0.1,
      },
    }));
  }),
  summarizeFetchResults: mock((results: Array<{ url: string }>) => {
    return `Summary: ${results.length} results fetched`;
  }),
}));

// Mock the search engines before importing the tool
mock.module('./duckduckgo', () => ({
  searchDuckDuckGo: mock(async () => []),
}));

mock.module('./google', () => ({
  searchGoogle: mock(async () => []),
}));

// Import after mocking
const { createSearchWebTool, createWebFetchTool } = await import('./tools');

describe('websearch tools', () => {
  const mockContext: ToolContext = {
    sessionID: 'test-session',
    messageID: 'test-message',
    agent: 'test-agent',
    directory: '/test/dir',
    worktree: '/test/dir',
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };

  test('creates a tool with execute method', () => {
    const tool = createSearchWebTool('.');
    expect(tool).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  test('handles empty results from all engines', async () => {
    const tool = createSearchWebTool('.');
    const result = await tool.execute(
      {
        query: 'test query',
        limit: 5,
        timeout: 1000,
        locale: 'en-US',
      },
      mockContext,
    );
    expect(result).toContain('No results found');
  });

  test('handles mixed success and failure', async () => {
    // Mock browser module again since we're re-importing
    mock.module('./browser', () => ({
      getBrowser: mock(async () => ({
        getPuppeteerBrowser: () => ({
          newPage: mock(async () => ({
            goto: mock(async () => {}),
            waitForSelector: mock(async () => {}),
            evaluate: mock(async () => []),
            close: mock(async () => {}),
          })),
          close: mock(async () => {}),
        }),
        cleanup: mock(async () => {}),
      })),
    }));

    // Mock fetcher module again
    mock.module('./fetcher', () => ({
      fetchMultipleWebpagesToMarkdown: mock(async (urls: string[]) => {
        return urls.map((url) => ({
          url,
          title: `Fetched: ${url}`,
          content: `# Content from ${url}\n\nThis is fetched content.`,
          length: 100,
          success: true,
          metadata: {
            fetchTime: 100,
            originalSize: 1000,
            markdownSize: 100,
            compressionRatio: 0.1,
          },
        }));
      }),
      summarizeFetchResults: mock((results: Array<{ url: string }>) => {
        return `Summary: ${results.length} results fetched`;
      }),
    }));

    // Mock google to fail, duckduckgo to succeed with one result
    mock.module('./google', () => ({
      searchGoogle: mock(async () => {
        throw new Error('Network error');
      }),
    }));
    mock.module('./duckduckgo', () => ({
      searchDuckDuckGo: mock(async () => [
        { title: 'Test Result', link: 'https://example.com', snippet: 'Test snippet' },
      ]),
    }));

    const { createSearchWebTool: createTool } = await import('./tools');
    const tool = createTool('.');
    const result = await tool.execute(
      {
        query: 'test query',
        limit: 5,
        timeout: 1000,
        locale: 'en-US',
      },
      mockContext,
    );
    expect(result).toContain('Found');
    expect(result).toContain('duckduckgo(1)');
    // google is not included in summary because it failed
    expect(result).not.toContain('google(0)');
  });

  test('fetches content when fetch_content is true', async () => {
    // Mock search to return results
    mock.module('./duckduckgo', () => ({
      searchDuckDuckGo: mock(async () => [
        { title: 'Test Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
        { title: 'Test Result 2', link: 'https://example.com/2', snippet: 'Snippet 2' },
      ]),
    }));

    const { createSearchWebTool: createTool } = await import('./tools');
    const tool = createTool('.');
    const result = await tool.execute(
      {
        query: 'test query',
        fetch_content: true,
        max_content_length: 5000,
      },
      mockContext,
    );

    expect(result).toContain('Found');
    expect(result).toContain('https://example.com/1');
    expect(result).toContain('https://example.com/2');
    // Should contain fetched content
    expect(result).toContain('Content from https://example.com/1');
  });

  test('creates webfetch tool with execute method', () => {
    const tool = createWebFetchTool('.');
    expect(tool).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  test('webfetch tool fetches multiple URLs', async () => {
    const tool = createWebFetchTool('.');
    const result = await tool.execute(
      {
        urls: ['https://example.com/1', 'https://example.com/2'],
        timeout: 5000,
        optimize_for_llm: true,
        max_content_length: 5000,
        include_summary: true,
      },
      mockContext,
    );

    expect(result).toContain('Summary:');
    expect(result).toContain('https://example.com/1');
    expect(result).toContain('https://example.com/2');
    expect(result).toContain('Fetched:');
    expect(result).toContain('Content preview');
  });

  test('webfetch tool handles invalid URLs', async () => {
    const tool = createWebFetchTool('.');
    const result = await tool.execute(
      {
        urls: ['not-a-valid-url', 'https://example.com'],
      },
      mockContext,
    );

    expect(result).toContain('invalid URL');
    expect(result).toContain('https://example.com');
  });

  test('webfetch tool handles empty valid URLs', async () => {
    const tool = createWebFetchTool('.');
    const result = await tool.execute(
      {
        urls: ['not-a-valid-url', 'also-invalid'],
      },
      mockContext,
    );

    expect(result).toContain('No valid URLs provided');
  });
});
