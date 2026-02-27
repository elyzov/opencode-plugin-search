export interface SearchEngineResult {
  title: string;
  link: string;
  snippet: string;
  source: 'google' | 'duckduckgo';
  rank: number;
}

export interface SearchResponse {
  query: string;
  results: SearchEngineResult[];
  sources: {
    google?: { count: number; success: boolean; error?: string };
    duckduckgo?: { count: number; success: boolean; error?: string };
  };
}

export interface BaseSearchOptions {
  limit: number;
  timeout: number;
  locale: string;
}

export interface GoogleSearchOptions extends BaseSearchOptions {
  safe_search?: boolean;
  country?: string;
  use_saved_state?: boolean;
}

export interface DuckDuckGoSearchOptions extends BaseSearchOptions {
  safe_search?: boolean;
  region?: string;
  time_range?: 'd' | 'w' | 'm' | 'y';
}

export interface DuckDuckGoApiResponse {
  Abstract?: string;
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Heading?: string;
  Results?: Array<{
    Text?: string;
    FirstURL?: string;
  }>;
  RelatedTopics?: Array<DuckDuckGoTopic>;
}

export interface DuckDuckGoTopic {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Topics?: DuckDuckGoTopic[];
  [key: string]: unknown;
}
