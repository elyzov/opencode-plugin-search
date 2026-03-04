import { type ToolContext, tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config';
import { fetchMultipleWebpagesToMarkdown } from './fetcher';

export function createFetchWebpagesTool(_directory: string, _config?: PluginConfig) {
  return tool({
    description:
      'Fetch webpages and convert them to LLM-optimized markdown. Useful for reading detailed documentation, articles, blog posts, or technical content during development research.',
    args: {
      url: tool.schema.string().optional().describe('If you need to fetch single URL only.'),
      urls: tool.schema.array(tool.schema.string()).min(1).max(10).optional().describe('List of URLs to be fetched.'),
      timeout: tool.schema.number().int().positive().max(120000).optional(),
      // TODO: summarize: tool.schema.boolean().optional().describe('Provide only summarized content instead of the full one.'),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const { url, urls, timeout = 30000 } = args;

      // Normalize URLs: collect from both url and urls parameters
      const rawUrls: string[] = [];

      // Handle single url parameter
      if (typeof url === 'string' && url.trim()) {
        rawUrls.push(url.trim());
      }

      // Handle urls parameter (could be array, JSON string, or single string)
      if (urls !== undefined && urls !== null) {
        if (typeof urls === 'string') {
          const urlsString: string = urls;
          // Try to parse as JSON array
          try {
            const parsed = JSON.parse(urlsString);
            if (Array.isArray(parsed)) {
              parsed.forEach((u: unknown) => {
                if (typeof u === 'string' && u.trim()) {
                  rawUrls.push(u.trim());
                }
              });
            } else if (typeof parsed === 'string' && parsed.trim()) {
              rawUrls.push(parsed.trim());
            }
          } catch {
            // If not valid JSON, treat as a single URL string
            if (urlsString.trim()) {
              rawUrls.push(urlsString.trim());
            }
          }
        } else if (Array.isArray(urls)) {
          urls.forEach((u: unknown) => {
            if (typeof u === 'string' && u.trim()) {
              rawUrls.push(u.trim());
            }
          });
        }
      }

      // Deduplicate URLs
      const uniqueUrls = [...new Set(rawUrls)];

      if (uniqueUrls.length === 0) {
        return 'No URLs provided. Please provide at least one valid URL using the "url" or "urls" parameter.';
      }

      // Validate URLs
      const validUrls: string[] = [];
      const invalidUrls: string[] = [];

      uniqueUrls.forEach((url) => {
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
      const results = await fetchMultipleWebpagesToMarkdown(validUrls, { timeout });

      // Format output
      let output = '';

      // Add detailed results
      output += '## Fetch Results\n\n';
      results.forEach((result, index) => {
        output += `### ${index + 1}. ${result.url}\n`;
        output += `- **Title**: ${result.title || 'No title'}\n`;
        output += `- **Status**: ${result.success ? '✅ Success' : `❌ Failed: ${result.error}`}\n`;

        if (result.success) {
          // Add webpage content
          output += '#### Content\n\n';
          output += result.content;
          output += '---\n\n';
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
