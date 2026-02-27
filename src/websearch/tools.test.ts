import { describe, expect, mock, test } from 'bun:test';
import type { ToolContext } from '@opencode-ai/plugin';

// Mock the search engines before importing the tool
mock.module('./duckduckgo', () => ({
  searchDuckDuckGo: mock(async () => []),
}));

mock.module('./google', () => ({
  searchGoogle: mock(async () => []),
}));

// Import after mocking
const { createWebSearchTool } = await import('./tools');

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
    const tool = createWebSearchTool();
    expect(tool).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  test('handles empty results from all engines', async () => {
    const tool = createWebSearchTool();
    const result = await tool.execute(
      {
        query: 'test query',
        engines: { duckduckgo: {} },
        limit: 5,
        timeout: 1000,
        locale: 'en-US',
      },
      mockContext,
    );
    expect(result).toContain('No results found');
  });

  test('handles mixed success and failure', async () => {
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

    const { createWebSearchTool: createTool } = await import('./tools');
    const tool = createTool();
    const result = await tool.execute(
      {
        query: 'test query',
        engines: { google: {}, duckduckgo: {} },
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
});
