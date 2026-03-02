import type { Plugin } from '@opencode-ai/plugin';

import { createDumpSyntaxTool, createFindByRuleTool, createFindTool, createTestRuleTool } from './astgrep';
import { loadConfig } from './config';
import { createSearchWebTool, createWebFetchTool } from './websearch';

export const SearchPlugin: Plugin = async ({ directory }) => {
  const config = await loadConfig(directory);

  return {
    tool: {
      codebase_find: createFindTool(directory),
      codebase_find_by_rule: createFindByRuleTool(directory),
      codebase_dump_syntax: createDumpSyntaxTool(),
      codebase_test_rule: createTestRuleTool(directory),
      search_web: createSearchWebTool(directory, config),
      fetch_urls: createWebFetchTool(directory, config),
    },
  };
};
