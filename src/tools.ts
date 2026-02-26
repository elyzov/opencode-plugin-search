import { type ToolContext, tool } from '@opencode-ai/plugin';
import yaml from 'js-yaml';
import type { z } from 'zod';
import { executeAstGrep, formatMatchesAsText } from './utils';

const patternSchema = tool.schema.union([
  tool.schema.string(),
  tool.schema.object({
    context: tool.schema.string(),
    selector: tool.schema.string(),
    strictness: tool.schema.enum(['cst', 'smart', 'ast', 'relaxed', 'signature']).optional(),
  }),
]);

const ruleObjectSchema: z.ZodType<unknown> = tool.schema.lazy(() =>
  tool.schema
    .object({
      pattern: patternSchema.optional(),
      kind: tool.schema.string().optional(),
      regex: tool.schema.string().optional(),
      inside: ruleObjectSchema.optional(),
      has: ruleObjectSchema.optional(),
      follows: ruleObjectSchema.optional(),
      precedes: ruleObjectSchema.optional(),
      all: tool.schema.array(ruleObjectSchema).optional(),
      any: tool.schema.array(ruleObjectSchema).optional(),
      not: ruleObjectSchema.optional(),
      matches: tool.schema.string().optional(),
      stopBy: tool.schema.union([tool.schema.enum(['neighbor', 'end']), ruleObjectSchema]).optional(),
      field: tool.schema.string().optional(),
    })
    .passthrough()
    .refine((obj) => Object.keys(obj).length > 0, {
      message: 'Rule object must have at least one property (e.g., pattern, kind, has, inside)',
    }),
);

const ruleSchema = tool.schema.object({
  id: tool.schema.string(),
  language: tool.schema.string(),
  rule: ruleObjectSchema,
  message: tool.schema.string().optional(),
  severity: tool.schema.enum(['error', 'warning', 'info', 'hint']).optional(),
  fix: tool.schema.string().optional(),
});

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
    description: 'Find code using a structured AST rule for advanced structural queries.',
    args: {
      rule: ruleSchema,
      max_results: tool.schema.number().int().positive().optional(),
      output_format: tool.schema.enum(['text', 'json']).optional(),
    },
    async execute(args, _context: ToolContext) {
      const { rule, max_results, output_format = 'text' } = args;

      try {
        const yamlString = yaml.dump(rule);
        const cmdArgs = ['--inline-rules', yamlString, '--json', '.'];

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
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot parse rule')) {
          return `Invalid rule structure: ${error.message}\n\nRule must include id, language, and rule fields. The rule field must be an object with at least one property (pattern, kind, has, inside, etc.). Example:\n${JSON.stringify(
            {
              id: 'example-rule',
              language: 'javascript',
              rule: {
                pattern: 'console.log($ARG)',
              },
            },
            null,
            2,
          )}`;
        }
        throw error;
      }
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
    description: 'Test a structured AST rule against a code snippet to verify matches.',
    args: {
      code: tool.schema.string(),
      rule: ruleSchema,
    },
    async execute(args, _context: ToolContext) {
      const { code, rule } = args;

      try {
        const yamlString = yaml.dump(rule);
        const cmdArgs = ['--inline-rules', yamlString, '--json', '--stdin'];
        const { matches } = await executeAstGrep('scan', cmdArgs, {
          input: code,
          directory,
        });
        if (matches.length === 0) {
          return 'No matches found for the given code and rule. Try adding `stopBy: end` to your inside/has rule.';
        }
        return JSON.stringify(matches, null, 2);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot parse rule')) {
          return `Invalid rule structure: ${error.message}\n\nRule must include id, language, and rule fields. The rule field must be an object with at least one property (pattern, kind, has, inside, etc.). Example:\n${JSON.stringify(
            {
              id: 'test-rule',
              language: 'javascript',
              rule: {
                pattern: 'console.log($ARG)',
              },
            },
            null,
            2,
          )}`;
        }
        throw error;
      }
    },
  });
}
