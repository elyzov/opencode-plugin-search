import { describe, expect, test } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import { AstGrepPlugin } from './plugin';

describe('AstGrepPlugin', () => {
  test('returns plugin with tool definitions', async () => {
    // Create a minimal plugin input for testing
    const pluginInput = {
      directory: '/test/dir',
    } as unknown as PluginInput;

    const plugin = await AstGrepPlugin(pluginInput);

    expect(plugin).toBeDefined();
    expect(plugin.tool).toBeDefined();
    expect(typeof plugin.tool).toBe('object');

    const tools = plugin.tool;

    // Check that all expected tools are present
    expect(tools?.ast_grep_find).toBeDefined();
    expect(tools?.ast_grep_find_by_rule).toBeDefined();
    expect(tools?.ast_grep_dump_syntax).toBeDefined();
    expect(tools?.ast_grep_test_rule).toBeDefined();

    // Check that tools have execute method
    expect(typeof tools?.ast_grep_find?.execute).toBe('function');
    expect(typeof tools?.ast_grep_find_by_rule?.execute).toBe('function');
    expect(typeof tools?.ast_grep_dump_syntax?.execute).toBe('function');
    expect(typeof tools?.ast_grep_test_rule?.execute).toBe('function');
  });
});
