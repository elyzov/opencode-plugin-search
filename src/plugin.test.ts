import { describe, expect, test } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import { SearchPlugin } from './plugin';

describe('SearchPlugin', () => {
  test('returns plugin with tool definitions', async () => {
    // Create a minimal plugin input for testing
    const pluginInput = {
      directory: '/test/dir',
    } as unknown as PluginInput;

    const plugin = await SearchPlugin(pluginInput);

    expect(plugin).toBeDefined();
    expect(plugin.tool).toBeDefined();
    expect(typeof plugin.tool).toBe('object');

    const tools = plugin.tool;

    // Check that all expected tools are present
    expect(tools?.codebase_find).toBeDefined();
    expect(tools?.codebase_find_by_rule).toBeDefined();
    expect(tools?.codebase_dump_syntax).toBeDefined();
    expect(tools?.codebase_test_rule).toBeDefined();
    expect(tools?.search_web).toBeDefined();
    expect(tools?.fetch_urls).toBeDefined();

    // Check that tools have execute method
    expect(typeof tools?.codebase_find?.execute).toBe('function');
    expect(typeof tools?.codebase_find_by_rule?.execute).toBe('function');
    expect(typeof tools?.codebase_dump_syntax?.execute).toBe('function');
    expect(typeof tools?.codebase_test_rule?.execute).toBe('function');
    expect(typeof tools?.search_web?.execute).toBe('function');
    expect(typeof tools?.fetch_urls?.execute).toBe('function');
  });
});
