import { type ToolContext, tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config';
import { fetchMultipleWebpagesToMarkdown, summarizeFetchResults } from './fetcher';

export function createFetchWebpagesTool(_directory: string, _config?: PluginConfig) {
  return tool({
    description:
      'Fetch webpages and convert them to LLM-optimized markdown. Useful for reading detailed documentation, articles, blog posts, or technical content during development research.',
    args: {
      urls: tool.schema.array(tool.schema.string()).min(1).max(10),
      timeout: tool.schema.number().int().positive().max(120000).optional(),
      optimize_for_llm: tool.schema.boolean().optional(),
      max_content_length: tool.schema.number().int().positive().max(50000).optional(),
      include_summary: tool.schema.boolean().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const {
        urls,
        timeout = 30000,
        optimize_for_llm = true,
        max_content_length = 10000,
        include_summary = true,
      } = args;

      // Validate URLs
      const validUrls: string[] = [];
      const invalidUrls: string[] = [];

      urls.forEach((url) => {
        try {
          new URL(url);
          validUrls.push(url);
        } catch {
          invalidUrls.push(url);
        }
      });

      if (validUrls.length === 0) {
        return `No valid URLs provided. Invalid URLs: ${invalidUrls.join(', ')}`;
      }

      // Fetch webpages
      const results = await fetchMultipleWebpagesToMarkdown(validUrls, {
        timeout,
        optimizeForLLM: optimize_for_llm,
        maxLength: max_content_length,
      });

      // Format output
      let output = '';

      if (include_summary) {
        output += `${summarizeFetchResults(results)}\n\n`;
      }

      // Add detailed results
      output += '## Detailed Results\n\n';
      results.forEach((result, index) => {
        output += `### ${index + 1}. ${result.url}\n`;
        output += `**Title**: ${result.title || 'No title'}\n`;
        output += `**Status**: ${result.success ? '✅ Success' : `❌ Failed: ${result.error}`}\n`;

        if (result.success) {
          output += `**Content length**: ${result.length} characters\n`;
          output += `**Fetch time**: ${result.metadata.fetchTime}ms\n`;
          output += `**Compression**: ${(result.metadata.compressionRatio * 100).toFixed(1)}%\n\n`;

          // Add content preview
          const previewLength = Math.min(500, result.content.length);
          output += '**Content preview**:\n```markdown\n';
          output += result.content.substring(0, previewLength);
          if (result.content.length > previewLength) {
            output += '...\n';
          }
          output += '```\n\n';
        } else {
          output += '\n';
        }
      });

      // Add warning about invalid URLs if any
      if (invalidUrls.length > 0) {
        output += `\n**Warning**: ${invalidUrls.length} invalid URL(s) were ignored: ${invalidUrls.join(', ')}`;
      }

      return output;
    },
  });
}
