import { type ToolContext, tool } from '@opencode-ai/plugin';
import { executeAstGrep, formatMatchesAsText } from './utils';

export function createFindTool(directory: string) {
  return tool({
    description: 'Find code in the project using a simple AST pattern.',
    args: {
      pattern: tool.schema.string(),
      language: tool.schema.string().optional(),
      max_results: tool.schema.number().int().positive().optional(),
      output_format: tool.schema.enum(['text', 'json']).optional(),
    },
    async execute(args, _context: ToolContext) {
      const { pattern, language, max_results, output_format = 'text' } = args;
      const cmdArgs = ['--pattern', pattern];
      if (language) {
        cmdArgs.push('--lang', language);
      }
      cmdArgs.push('--json'); // always get JSON internally for accurate limiting
      cmdArgs.push('.'); // search in current directory (plugin's directory)

      const { matches } = await executeAstGrep('run', cmdArgs, {
        directory,
      });

      // Apply max_results limit to complete matches
      const totalMatches = matches.length;
      let limitedMatches = matches;
      if (max_results && totalMatches > max_results) {
        limitedMatches = matches.slice(0, max_results);
      }

      if (output_format === 'json') {
        return JSON.stringify(limitedMatches, null, 2);
      }

      // text format
      if (limitedMatches.length === 0) {
        return 'No matches found';
      }

      const textOutput = formatMatchesAsText(limitedMatches);
      let header = `Found ${limitedMatches.length} matches`;
      if (max_results && totalMatches > max_results) {
        header += ` (showing first ${max_results} of ${totalMatches})`;
      }
      return `${header}:\n\n${textOutput}`;
    },
  });
}

export function createFindByRuleTool(directory: string) {
  return tool({
    description: 'Find code using a complex YAML rule for advanced structural queries.',
    args: {
      yaml: tool.schema.string(),
      max_results: tool.schema.number().int().positive().optional(),
      output_format: tool.schema.enum(['text', 'json']).optional(),
    },
    async execute(args, _context: ToolContext) {
      const { yaml, max_results, output_format = 'text' } = args;
      const cmdArgs = ['--inline-rules', yaml, '--json', '.'];

      const { matches } = await executeAstGrep('scan', cmdArgs, {
        directory,
      });

      const totalMatches = matches.length;
      let limitedMatches = matches;
      if (max_results && totalMatches > max_results) {
        limitedMatches = matches.slice(0, max_results);
      }

      if (output_format === 'json') {
        return JSON.stringify(limitedMatches, null, 2);
      }

      if (limitedMatches.length === 0) {
        return 'No matches found';
      }

      const textOutput = formatMatchesAsText(limitedMatches);
      let header = `Found ${limitedMatches.length} matches`;
      if (max_results && totalMatches > max_results) {
        header += ` (showing first ${max_results} of ${totalMatches})`;
      }
      return `${header}:\n\n${textOutput}`;
    },
  });
}

export function createDumpSyntaxTool() {
  return tool({
    description: 'Dump the syntax tree of a code snippet to understand AST structure.',
    args: {
      code: tool.schema.string(),
      language: tool.schema.string(),
      format: tool.schema.enum(['cst', 'ast', 'pattern']).optional(),
    },
    async execute(args, _context: ToolContext) {
      const { code, language, format = 'cst' } = args;
      const cmdArgs = ['--pattern', code, '--lang', language, `--debug-query=${format}`];
      // debug-query outputs to stderr
      const { stderr } = await executeAstGrep('run', cmdArgs, {});
      return stderr.trim() || '(no output)';
    },
  });
}

export function createTestRuleTool(directory: string) {
  return tool({
    description: 'Test a YAML rule against a code snippet to verify matches.',
    args: {
      code: tool.schema.string(),
      yaml: tool.schema.string(),
    },
    async execute(args, _context: ToolContext) {
      const { code, yaml } = args;
      const cmdArgs = ['--inline-rules', yaml, '--json', '--stdin'];
      const { matches } = await executeAstGrep('scan', cmdArgs, {
        input: code,
        directory,
      });
      if (matches.length === 0) {
        return 'No matches found for the given code and rule. Try adding `stopBy: end` to your inside/has rule.';
      }
      return JSON.stringify(matches, null, 2);
    },
  });
}
