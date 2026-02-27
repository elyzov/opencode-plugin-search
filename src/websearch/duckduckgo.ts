import type { DuckDuckGoApiResponse, DuckDuckGoSearchOptions, DuckDuckGoTopic, SearchEngineResult } from './types';

export async function searchDuckDuckGo(
  query: string,
  options: DuckDuckGoSearchOptions,
): Promise<Omit<SearchEngineResult, 'source' | 'rank'>[]> {
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`,
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.statusText}`);
    }

    const data = (await response.json()) as DuckDuckGoApiResponse;

    // DuckDuckGo API returns RelatedTopics and Results
    const results: Omit<SearchEngineResult, 'source' | 'rank'>[] = [];

    // Extract from Abstract (instant answer)
    if (data.Abstract && data.AbstractText) {
      results.push({
        title: data.Heading || data.AbstractSource || 'Instant Answer',
        link: data.AbstractURL || '',
        snippet: data.AbstractText,
      });
    }

    // Extract from Results
    if (data.Results && Array.isArray(data.Results)) {
      data.Results.forEach((item) => {
        if (item.FirstURL) {
          results.push({
            title: item.Text || '',
            link: item.FirstURL,
            snippet: '',
          });
        }
      });
    }

    // Extract from RelatedTopics (can be nested)
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      const extractFromTopics = (topics: DuckDuckGoTopic[]) => {
        topics.forEach((item) => {
          // Handle nested Topics structure
          if (item.Topics && Array.isArray(item.Topics)) {
            extractFromTopics(item.Topics);
            return;
          }

          if (item.FirstURL && item.Text) {
            results.push({
              title: item.Text.split(' - ')[0] || item.Text,
              link: item.FirstURL,
              snippet: item.Text.split(' - ').slice(1).join(' - ') || '',
            });
          }
        });
      };

      extractFromTopics(data.RelatedTopics);
    }

    return results.slice(0, options.limit);
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
    throw new Error(`DuckDuckGo search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
