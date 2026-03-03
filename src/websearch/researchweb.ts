import path from 'node:path';
import { type ToolContext, tool } from '@opencode-ai/plugin';
import type { PluginConfig, SearchEngineConfig } from '../config';
import { getBrowser } from './browser';
import { searchDuckDuckGo } from './duckduckgo';
import { searchGoogle } from './google';
import type { GoogleSearchOptions, SearchEngineResult, SearchResponse } from './types';

interface EngineConfigWithWeight {
  name: 'google' | 'duckduckgo';
  weight: number;
  config: SearchEngineConfig;
}

/**
 * Get enabled search engines with normalized weights from config
 */
function getEnabledEngines(config?: PluginConfig): EngineConfigWithWeight[] {
  const engines: EngineConfigWithWeight[] = [];
  const searchEngines = config?.searchEngines;

  // Default configuration if not specified
  const defaultEngines = {
    google: { enabled: true, weight: 1 },
    duckduckgo: { enabled: true, weight: 1 },
  };

  // Check Google
  const googleConfig = searchEngines?.google ?? defaultEngines.google;
  if (googleConfig.enabled !== false) {
    engines.push({
      name: 'google',
      weight: googleConfig.weight ?? 1,
      config: googleConfig,
    });
  }

  // Check DuckDuckGo
  const duckduckgoConfig = searchEngines?.duckduckgo ?? defaultEngines.duckduckgo;
  if (duckduckgoConfig.enabled !== false) {
    engines.push({
      name: 'duckduckgo',
      weight: duckduckgoConfig.weight ?? 1,
      config: duckduckgoConfig,
    });
  }

  // If no engines enabled, default to both with equal weights
  if (engines.length === 0) {
    engines.push(
      { name: 'google', weight: 1, config: defaultEngines.google },
      { name: 'duckduckgo', weight: 1, config: defaultEngines.duckduckgo },
    );
  }

  // Normalize weights to sum to 1
  const totalWeight = engines.reduce((sum, engine) => sum + engine.weight, 0);
  if (totalWeight > 0) {
    engines.forEach((engine) => {
      engine.weight = engine.weight / totalWeight;
    });
  }

  return engines;
}

/**
 * Calculate per-engine limits based on total limit and weights
 */
function calculateEngineLimits(
  engines: EngineConfigWithWeight[],
  totalLimit: number,
): Map<'google' | 'duckduckgo', number> {
  const limits = new Map<'google' | 'duckduckgo', number>();
  let remaining = totalLimit;
  let allocated = 0;

  // Sort engines by weight descending for fair allocation
  const sortedEngines = [...engines].sort((a, b) => b.weight - a.weight);

  for (const engine of sortedEngines) {
    // Calculate proportional limit, rounding to nearest integer
    let engineLimit = Math.round(engine.weight * totalLimit);

    // Ensure at least 1 result if weight > 0
    if (engineLimit < 1 && engine.weight > 0) {
      engineLimit = 1;
    }

    // Adjust if we would exceed total limit
    if (allocated + engineLimit > totalLimit) {
      engineLimit = totalLimit - allocated;
    }

    // Ensure we don't allocate more than remaining
    engineLimit = Math.min(engineLimit, remaining);

    if (engineLimit > 0) {
      limits.set(engine.name, engineLimit);
      allocated += engineLimit;
      remaining -= engineLimit;
    }
  }

  // If there are still remaining slots (due to rounding), distribute them
  if (remaining > 0) {
    for (const engine of sortedEngines) {
      if (remaining <= 0) break;
      const currentLimit = limits.get(engine.name) || 0;
      limits.set(engine.name, currentLimit + 1);
      remaining -= 1;
    }
  }

  return limits;
}

export function createResearchWebTool(directory: string, config?: PluginConfig) {
  return tool({
    description:
      'Search the web for technical information, documentation, best practices, or solutions. Use when researching libraries, APIs, development patterns, or any information not found in the local codebase. Supports Google and DuckDuckGo.',
    args: {
      query: tool.schema.string(),
      limit: tool.schema.number().int().positive().max(20).optional(),
      timeout: tool.schema.number().int().positive().max(120000).optional(),
      locale: tool.schema.string().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const { query, limit = 10, timeout = 30000, locale = 'en-US' } = args;

      const results: SearchEngineResult[] = [];
      const sources: SearchResponse['sources'] = {};

      // Get enabled engines with normalized weights
      const enabledEngines = getEnabledEngines(config);
      if (enabledEngines.length === 0) {
        return 'No search engines enabled. Please configure at least one search engine in plugin configuration.';
      }

      // Calculate per-engine limits based on weights
      const engineLimits = calculateEngineLimits(enabledEngines, limit);
      console.log(
        `Searching with engines: ${enabledEngines.map((e) => `${e.name} (weight: ${e.weight.toFixed(2)}, limit: ${engineLimits.get(e.name)})`).join(', ')}`,
      );

      if (config?.browser?.executablePath) {
        // If the executable path is relative, prepend the plugin directory
        if (!path.isAbsolute(config.browser.executablePath)) {
          config.browser.executablePath = path.join(directory, config.browser.executablePath);
        }
      }

      const searchPromises: Promise<void>[] = [];
      const browserInstance = await getBrowser(config?.browser);
      const browser = browserInstance.getPuppeteerBrowser();

      for (const engine of enabledEngines) {
        if (engine.name === 'google') {
          const googleOptions: GoogleSearchOptions = {
            timeout,
            locale,
            safe_search: engine.config.options?.safe_search,
            use_saved_state: engine.config.options?.use_saved_state,
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
        } else if (engine.name === 'duckduckgo') {
          // Create new browser page for DuckDuckGo
          const duckduckgoPage = await browser.newPage();
          searchPromises.push(
            searchDuckDuckGo(
              query,
              {
                timeout,
                locale,
                safe_search: engine.config.options?.safe_search,
              },
              duckduckgoPage,
            )
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
      if (results.length > 0) {
        // Deduplicate URLs while maintaining mapping from each result to its content
        const urlToIndex = new Map<string, number>();
        const uniqueUrls: string[] = [];

        for (const result of results) {
          if (!urlToIndex.has(result.link)) {
            urlToIndex.set(result.link, uniqueUrls.length);
            uniqueUrls.push(result.link);
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
          (r, i) => `${i + 1}. [${r.source.toUpperCase()}] ${r.title}\n   ${r.link}\n   ${r.snippet || 'No snippet'}\n`,
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
