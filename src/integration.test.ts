import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { PluginInput, ToolContext } from '@opencode-ai/plugin';
import { SearchPlugin } from './plugin';

describe('integration (requires ast-grep)', () => {
  const fixturesDir = join(process.cwd(), 'test/fixtures');

  const mockContext: ToolContext = {
    sessionID: 'test-session',
    messageID: 'test-message',
    agent: 'test-agent',
    directory: fixturesDir,
    worktree: fixturesDir,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };

  test('finds console.log statements using plugin tool', async () => {
    const pluginInput = { directory: fixturesDir } as PluginInput;
    const plugin = await SearchPlugin(pluginInput);
    const findTool = plugin.tool?.ast_grep_find;

    expect(findTool).toBeDefined();
    expect(typeof findTool?.execute).toBe('function');

    // biome-ignore lint/style/noNonNullAssertion: tested above
    const result = await findTool!.execute(
      {
        pattern: 'console.log($ARG)',
        language: 'javascript',
        output_format: 'json',
      },
      mockContext,
    );

    const matches = JSON.parse(result);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.text).toContain('console.log');
  });

  test('dumps syntax tree using plugin tool', async () => {
    const pluginInput = { directory: fixturesDir } as PluginInput;
    const plugin = await SearchPlugin(pluginInput);
    const dumpSyntaxTool = plugin.tool?.ast_grep_dump_syntax;

    expect(dumpSyntaxTool).toBeDefined();
    expect(typeof dumpSyntaxTool?.execute).toBe('function');

    // biome-ignore lint/style/noNonNullAssertion: tested above
    const result = await dumpSyntaxTool!.execute(
      {
        code: 'function hello() {}',
        language: 'javascript',
        format: 'cst',
      },
      mockContext,
    );

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  test('tests structured rule using plugin tool', async () => {
    const pluginInput = { directory: fixturesDir } as PluginInput;
    const plugin = await SearchPlugin(pluginInput);
    const testRuleTool = plugin.tool?.ast_grep_test_rule;

    expect(testRuleTool).toBeDefined();
    expect(typeof testRuleTool?.execute).toBe('function');

    const rule = {
      id: 'find-console',
      language: 'javascript',
      rule: {
        pattern: 'console.log($ARG)',
      },
    };

    // biome-ignore lint/style/noNonNullAssertion: tested above
    const result = await testRuleTool!.execute(
      {
        code: "console.log('test');\nfunction foo() {}",
        rule,
      },
      mockContext,
    );

    const matches = JSON.parse(result);
    expect(matches.length).toBe(1);
    expect(matches[0]?.text).toBe("console.log('test')");
  });
});
