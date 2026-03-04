import path from 'node:path';
import { type ToolContext, tool } from '@opencode-ai/plugin';
import type { PluginConfig, SearchEngineConfig } from '../config';
import { getBrowser } from './browser';
import { searchDuckDuckGo } from './duckduckgo';
import { searchGoogle } from './google';
import type { GoogleSearchOptions, SearchEngineResult, SearchResponse } from './types';

/**
 * Normalize URL for deduplication: remove www. prefix, strip trailing slash, and optionally normalize protocol.
 * Returns the normalized URL string, or original if parsing fails.
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Normalize hostname: remove www. prefix
    let hostname = urlObj.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    // Reconstruct URL with normalized hostname, preserving protocol, path, query, hash
    const normalized = new URL(`${urlObj.protocol}//${hostname}${urlObj.pathname}${urlObj.search}${urlObj.hash}`);
    // Remove trailing slash from pathname if present and pathname is not just '/'
    let normalizedStr = normalized.toString();
    if (
      normalizedStr.endsWith('/') &&
      normalizedStr.length > 1 &&
      normalizedStr !== `${normalized.protocol}//${hostname}/`
    ) {
      normalizedStr = normalizedStr.slice(0, -1);
    }
    return normalizedStr;
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

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

      let results: SearchEngineResult[] = [];
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

      // Sort engines by weight descending for priority
      const sortedEngines = [...enabledEngines].sort((a, b) => b.weight - a.weight);
      // Store results per engine (raw results without source/rank)
      const engineResults: Record<'google' | 'duckduckgo', Omit<SearchEngineResult, 'source' | 'rank'>[]> = {
        google: [],
        duckduckgo: [],
      };

      for (const engine of sortedEngines) {
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
                engineResults.google = googleResults;
                sources.google = { count: googleResults.length, success: true };
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
                engineResults.duckduckgo = ddResults;
                sources.duckduckgo = { count: ddResults.length, success: true };
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

      // Combine results from all engines, deduplicate by normalized URL

      // Step 1: Deduplicate results across all engines, keeping first occurrence (from higher-weight engines)
      const urlToResult = new Map<
        string,
        { result: Omit<SearchEngineResult, 'source' | 'rank'>; source: 'google' | 'duckduckgo'; originalRank: number }
      >();

      for (const engine of sortedEngines) {
        const engineResultsForEngine = engineResults[engine.name];
        if (!engineResultsForEngine || engineResultsForEngine.length === 0) {
          continue;
        }
        engineResultsForEngine.forEach((rawResult, originalRank) => {
          const normalizedUrl = normalizeUrl(rawResult.link);
          if (!urlToResult.has(normalizedUrl)) {
            urlToResult.set(normalizedUrl, { result: rawResult, source: engine.name, originalRank });
          }
        });
      }

      // Step 2: Group deduplicated results by source
      const resultsBySource: Record<
        'google' | 'duckduckgo',
        Array<{ result: Omit<SearchEngineResult, 'source' | 'rank'>; originalRank: number; normalizedUrl: string }>
      > = {
        google: [],
        duckduckgo: [],
      };

      for (const [normalizedUrl, { result, source, originalRank }] of urlToResult) {
        resultsBySource[source].push({ result, originalRank, normalizedUrl });
      }

      // Step 3: Sort results within each source by original rank
      resultsBySource.google.sort((a, b) => a.originalRank - b.originalRank);
      resultsBySource.duckduckgo.sort((a, b) => a.originalRank - b.originalRank);

      // Step 4: Select final results using pre-calculated engine limits
      const finalResults: SearchEngineResult[] = [];
      const takenPerEngine = new Map<'google' | 'duckduckgo', number>([
        ['google', 0],
        ['duckduckgo', 0],
      ]);

      // Step 5: Take results from each engine up to its pre-calculated limit
      for (const engine of sortedEngines) {
        const engineLimit = engineLimits.get(engine.name) || 0;
        const sourceResults = resultsBySource[engine.name];
        const takeCount = Math.min(engineLimit, sourceResults.length);

        for (const item of sourceResults.slice(0, takeCount)) {
          finalResults.push({
            ...item.result,
            source: engine.name,
            rank: finalResults.length + 1,
          });
        }
        takenPerEngine.set(engine.name, takeCount);
      }

      // Step 6: If we still have slots and results, fill from any remaining results
      if (finalResults.length < limit) {
        // Collect all remaining results from all engines
        const allRemaining: Array<{
          result: Omit<SearchEngineResult, 'source' | 'rank'>;
          source: 'google' | 'duckduckgo';
          originalRank: number;
          normalizedUrl: string;
        }> = [];

        for (const engine of sortedEngines) {
          const sourceResults = resultsBySource[engine.name];
          const alreadyTaken = takenPerEngine.get(engine.name) || 0;
          allRemaining.push(...sourceResults.slice(alreadyTaken).map((item) => ({ ...item, source: engine.name })));
        }

        // Sort by engine weight (already sorted) and original rank
        allRemaining.sort((a, b) => {
          // First by engine weight (higher weight first)
          const weightA = sortedEngines.find((e) => e.name === a.source)?.weight || 0;
          const weightB = sortedEngines.find((e) => e.name === b.source)?.weight || 0;
          if (weightB !== weightA) {
            return weightB - weightA;
          }
          // Then by original rank
          return a.originalRank - b.originalRank;
        });

        // Take remaining slots
        const needed = limit - finalResults.length;
        const toTake = Math.min(needed, allRemaining.length);
        for (const item of allRemaining.slice(0, toTake)) {
          finalResults.push({
            ...item.result,
            source: item.source,
            rank: finalResults.length + 1,
          });
        }
      }

      // Replace results with final selected results
      results = finalResults;

      // Update source counts to reflect final selection (not total fetched)
      const finalCounts = { google: 0, duckduckgo: 0 };
      for (const result of results) {
        finalCounts[result.source]++;
      }
      if (sources.google?.success) sources.google.count = finalCounts.google;
      if (sources.duckduckgo?.success) sources.duckduckgo.count = finalCounts.duckduckgo;

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
