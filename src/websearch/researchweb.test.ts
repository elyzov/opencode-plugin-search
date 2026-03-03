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

// Mock the search engines before importing the tool
mock.module('./duckduckgo', () => ({
  searchDuckDuckGo: mock(async () => []),
}));

mock.module('./google', () => ({
  searchGoogle: mock(async () => []),
}));

// Import after mocking
const { createResearchWebTool } = await import('./researchweb');

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
    const tool = createResearchWebTool('.');
    expect(tool).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  test('handles empty results from all engines', async () => {
    const tool = createResearchWebTool('.');
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

    const { createResearchWebTool: createTool } = await import('./researchweb');
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

  test('returns search results with snippets', async () => {
    // Mock search to return results
    mock.module('./duckduckgo', () => ({
      searchDuckDuckGo: mock(async () => [
        { title: 'Test Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
        { title: 'Test Result 2', link: 'https://example.com/2', snippet: 'Snippet 2' },
      ]),
    }));

    const { createResearchWebTool: createTool } = await import('./researchweb');
    const tool = createTool('.');
    const result = await tool.execute(
      {
        query: 'test query',
      },
      mockContext,
    );

    expect(result).toContain('Found');
    expect(result).toContain('https://example.com/1');
    expect(result).toContain('https://example.com/2');
    // Should contain snippets, not fetched content
    expect(result).toContain('Snippet 1');
    expect(result).toContain('Snippet 2');
  });
});
