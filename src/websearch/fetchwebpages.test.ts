import { describe, expect, mock, test } from 'bun:test';
import type { ToolContext } from '@opencode-ai/plugin';

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

// Import after mocking
const { createFetchWebpagesTool } = await import('./fetchwebpages');

describe('fetch_webpages tools', () => {
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

  test('creates webfetch tool with execute method', () => {
    const tool = createFetchWebpagesTool('.');
    expect(tool).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  test('webfetch tool fetches multiple URLs', async () => {
    const tool = createFetchWebpagesTool('.');
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
    const tool = createFetchWebpagesTool('.');
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
    const tool = createFetchWebpagesTool('.');
    const result = await tool.execute(
      {
        urls: ['not-a-valid-url', 'also-invalid'],
      },
      mockContext,
    );

    expect(result).toContain('No valid URLs provided');
  });
});
