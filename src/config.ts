import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { BrowserConfig } from './websearch';

export interface SearchEngineConfig {
  /** Whether this search engine is enabled */
  enabled?: boolean;
  /** Weight for distributing results limit (0-1, sum of all engine weights should be 1) */
  weight?: number;
  /** Engine-specific options */
  options?: {
    /** Enable safe search filtering */
    safe_search?: boolean;
    /** Reuse browser session (experimental) */
    use_saved_state?: boolean;
  };
}

export interface PluginConfig {
  browser?: BrowserConfig;
  /** Search engine configuration */
  searchEngines?: {
    google?: SearchEngineConfig;
    duckduckgo?: SearchEngineConfig;
  };
}

/**
 * Load configuration from multiple sources in order of priority:
 * 1. Environment variables (highest priority)
 * 2. Project config file (`.opencode-search.json`)
 * 3. User config file (`~/.opencode/plugin-search.json`)
 * 4. Default values (lowest priority)
 */
export async function loadConfig(projectDir?: string): Promise<PluginConfig> {
  const config: PluginConfig = {};

  // Try to load from user config file
  const userConfigPath = join(homedir(), '.opencode', 'plugin-search.json');
  try {
    const userConfig = JSON.parse(await readFile(userConfigPath, 'utf-8'));
    mergeConfig(config, userConfig);
  } catch {
    // User config file doesn't exist or is invalid, ignore
  }

  // Try to load from project config file
  if (projectDir) {
    const projectConfigPath = join(projectDir, '.opencode-search.json');
    try {
      const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf-8'));
      mergeConfig(config, projectConfig);
    } catch {
      // Project config file doesn't exist or is invalid, ignore
    }
  }

  return config;
}

function mergeConfig(target: PluginConfig, source: Partial<PluginConfig>) {
  if (source.browser) {
    target.browser = { ...target.browser, ...source.browser };
  }
  if (source.searchEngines) {
    target.searchEngines = { ...target.searchEngines, ...source.searchEngines };
  }
}

/**
 * Get browser configuration for Google search
 */
export function getGoogleBrowserConfig(
  userConfig: PluginConfig,
  toolOptions?: {
    headless?: boolean;
    country?: string;
    safe_search?: boolean;
    use_saved_state?: boolean;
  },
): BrowserConfig & { headless?: boolean } {
  const baseConfig = userConfig.browser || {};

  // Tool options override config options
  return {
    ...baseConfig,
    headless: toolOptions?.headless ?? baseConfig.headless ?? true,
  };
}
