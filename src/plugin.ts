import type { Plugin } from '@opencode-ai/plugin';

import { createDumpSyntaxTool, createFindByRuleTool, createFindTool, createTestRuleTool } from './tools';

export const SearchPlugin: Plugin = async ({ directory }) => {
  return {
    tool: {
      ast_grep_find: createFindTool(directory),
      ast_grep_find_by_rule: createFindByRuleTool(directory),
      ast_grep_dump_syntax: createDumpSyntaxTool(),
      ast_grep_test_rule: createTestRuleTool(directory),
    },
  };
};
