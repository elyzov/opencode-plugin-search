import path from 'node:path';
import { type ToolContext, tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config';
import { getBrowser } from './browser';
import { searchDuckDuckGo } from './duckduckgo';
import { fetchMultipleWebpagesToMarkdown, summarizeFetchResults } from './fetcher';
import { searchGoogle } from './google';
import type { GoogleSearchOptions, SearchEngineResult, SearchResponse } from './types';

const searchEngineOptionsSchema = tool.schema
  .object({
    duckduckgo: tool.schema
      .object({
        safe_search: tool.schema.boolean().optional(),
        region: tool.schema.string().optional(),
        time_range: tool.schema.enum(['d', 'w', 'm', 'y']).optional(), // day, week, month, year
      })
      .optional(),
    google: tool.schema
      .object({
        safe_search: tool.schema.boolean().optional(),
        country: tool.schema.string().optional(),
        headless: tool.schema.boolean().optional(),
        use_saved_state: tool.schema.boolean().optional(),
      })
      .optional(),
  })
  .refine((obj) => obj.duckduckgo !== undefined || obj.google !== undefined, {
    message: 'At least one search engine must be specified (duckduckgo or google)',
  });

export function createWebSearchTool(directory: string, config?: PluginConfig) {
  return tool({
    description:
      'Search the web using Google and/or DuckDuckGo. If multiple engines are specified, queries run in parallel.',
    args: {
      query: tool.schema.string(),
      engines: searchEngineOptionsSchema,
      limit: tool.schema.number().int().positive().max(50).optional(),
      timeout: tool.schema.number().int().positive().max(120000).optional(),
      locale: tool.schema.string().optional(),
      fetch_content: tool.schema.boolean().optional(),
      max_content_length: tool.schema.number().int().positive().max(50000).optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const {
        query,
        engines,
        limit = 10,
        timeout = 30000,
        locale = 'en-US',
        fetch_content = false,
        max_content_length = 10000,
      } = args;

      const results: SearchEngineResult[] = [];
      const sources: SearchResponse['sources'] = {};

      if (config?.browser?.executablePath) {
        // If the executable path is relative, prepend the plugin directory
        if (!path.isAbsolute(config.browser.executablePath)) {
          config.browser.executablePath = path.join(directory, config.browser.executablePath);
        }
      }

      const searchPromises: Promise<void>[] = [];
      const browserInstance = await getBrowser(config?.browser);
      const browser = browserInstance.getPuppeteerBrowser();

      if (engines.google) {
        // Merge user config with LLM options (LLM options take precedence)
        const googleOptions: GoogleSearchOptions = {
          ...engines.google, // LLM options (overrides user config for overlapping fields)
          limit,
          timeout,
          locale,
        };

        // Create new browser page
        const googlePage = await browser.newPage();

        searchPromises.push(
          searchGoogle(query, googleOptions, googlePage)
            .then((googleResults) => {
              sources.google = { count: googleResults.length, success: true };
              googleResults.forEach((result, index) => {
                results.push({
                  ...result,
                  source: 'google',
                  rank: index + 1,
                });
              });
            })
            .catch((error) => {
              sources.google = {
                count: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            })
            .finally(() => {
              googlePage.close();
            }),
        );
      }

      if (engines.duckduckgo) {
        // Create new browser page for DuckDuckGo
        const duckduckgoPage = await browser.newPage();

        searchPromises.push(
          searchDuckDuckGo(query, { ...engines.duckduckgo, limit, timeout, locale }, duckduckgoPage)
            .then((ddResults) => {
              sources.duckduckgo = { count: ddResults.length, success: true };
              ddResults.forEach((result, index) => {
                results.push({
                  ...result,
                  source: 'duckduckgo',
                  rank: index + 1,
                });
              });
            })
            .catch((error) => {
              sources.duckduckgo = {
                count: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            })
            .finally(() => {
              duckduckgoPage.close();
            }),
        );
      }

      // Wait for all searches to complete (or fail)
      await Promise.allSettled(searchPromises).finally(() => {
        // Cleanup browser instance if needed
        browserInstance.cleanup();
      });

      // Sort results by source and rank for consistent output
      results.sort((a, b) => {
        if (a.source === b.source) {
          return a.rank - b.rank;
        }
        return a.source === 'google' ? -1 : 1;
      });

      // Fetch content if requested
      if (fetch_content && results.length > 0) {
        // Deduplicate URLs while maintaining mapping from each result to its content
        const urlToIndex = new Map<string, number>();
        const uniqueUrls: string[] = [];

        for (const result of results) {
          if (!urlToIndex.has(result.link)) {
            urlToIndex.set(result.link, uniqueUrls.length);
            uniqueUrls.push(result.link);
          }
        }

        const fetchResults = await fetchMultipleWebpagesToMarkdown(uniqueUrls, {
          timeout: Math.min(timeout, 15000), // Cap at 15s per fetch
          optimizeForLLM: true,
          maxLength: max_content_length,
        });

        // Create a map from URL to fetched content
        const urlToContent = new Map<string, string>();
        for (const [i, url] of uniqueUrls.entries()) {
          const fetchResult = fetchResults[i];
          if (!fetchResult) continue;

          if (fetchResult.success && fetchResult.content) {
            urlToContent.set(url, fetchResult.content.substring(0, max_content_length));
          } else if (fetchResult.error) {
            urlToContent.set(url, `[Failed to fetch content: ${fetchResult.error}]`);
          } else {
            urlToContent.set(url, '[Failed to fetch content: Unknown error]');
          }
        }

        // Update each result with content from the map
        for (const result of results) {
          const content = urlToContent.get(result.link);
          if (content) {
            result.content = content;
          }
        }
      }

      // Format output
      if (results.length === 0) {
        const errors = Object.entries(sources)
          .filter(([_, info]) => !info?.success)
          .map(([engine, info]) => `${engine}: ${info?.error}`)
          .join('; ');
        return `No results found. ${errors ? `Errors: ${errors}` : 'Try adjusting your search terms.'}`;
      }

      const formatted = results
        .map(
          (r, i) => `${i + 1}. [${r.source.toUpperCase()}] ${r.title}\n   ${r.link}\n   ${r.content || 'No content'}\n`,
        )
        .join('\n');

      const summary = `Found ${results.length} results from: ${
        Object.entries(sources)
          .filter(([_, info]) => info?.success)
          .map(([engine, info]) => `${engine}(${info?.count})`)
          .join(', ') || 'none'
      }`;

      return `${summary}\n\n${formatted}`;
    },
  });
}

export function createWebFetchTool(_directory: string, _config?: PluginConfig) {
  return tool({
    description:
      'Fetch webpages and convert them to LLM-optimized markdown. Useful for getting detailed content from URLs found in search results or other sources.',
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
