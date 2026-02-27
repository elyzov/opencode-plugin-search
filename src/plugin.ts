import type { Plugin } from '@opencode-ai/plugin';

import { createDumpSyntaxTool, createFindByRuleTool, createFindTool, createTestRuleTool } from './astgrep';
import { loadConfig } from './config';
import { createWebSearchTool } from './websearch';

export const SearchPlugin: Plugin = async ({ directory }) => {
  const config = await loadConfig(directory);

  return {
    tool: {
      ast_grep_find: createFindTool(directory),
      ast_grep_find_by_rule: createFindByRuleTool(directory),
      ast_grep_dump_syntax: createDumpSyntaxTool(),
      ast_grep_test_rule: createTestRuleTool(directory),
      web_search: createWebSearchTool(config),
    },
  };
};
