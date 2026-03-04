import { htmlToMarkdown } from 'mdream';
import { withMinimalPreset } from 'mdream/preset/minimal';

export interface WebpageFetchOptions {
  /**
   * Timeout for fetching the webpage in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Base URL for resolving relative links and images
   */
  origin?: string;

  /**
   * User agent string to use for requests
   * @default 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
   */
  userAgent?: string;

  /**
   * Headers to include in the request
   */
  headers?: Record<string, string>;
}

export interface WebpageFetchResult {
  /** The fetched URL */
  url: string;

  /** The title of the webpage */
  title: string;

  /** The markdown content */
  content: string;

  /** Character count of the markdown content */
  length: number;

  /** Whether the fetch was successful */
  success: boolean;

  /** Error message if fetch failed */
  error?: string;

  /** Metadata about the fetch */
  metadata: {
    /** Time taken to fetch and convert in milliseconds */
    fetchTime: number;
    /** Original HTML size in bytes */
    originalSize: number;
    /** Markdown size in bytes */
    markdownSize: number;
    /** Compression ratio (markdown/original) */
    compressionRatio: number;
    /** HTTP status code if available */
    statusCode?: number;
  };
}

/**
 * Extracts title from HTML content
 */
function extractTitleFromHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }

  // Fallback: look for h1 tags
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }

  return '';
}

/**
 * Fetches a webpage and converts it to LLM-optimized markdown using mdream
 */
export async function fetchWebpageToMarkdown(
  url: string,
  options: WebpageFetchOptions = {},
): Promise<WebpageFetchResult> {
  const startTime = Date.now();
  const {
    timeout = 30000,
    origin,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    headers = {},
  } = options;

  try {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    const finalOrigin = origin || `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Create AbortController for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    try {
      // Fetch the webpage
      const response = await fetch(url, {
        signal: abortController.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          ...headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get HTML content
      const html = await response.text();
      const originalSize = html.length;

      // Extract title from HTML
      const title = extractTitleFromHtml(html);

      // Convert HTML to markdown using mdream
      const mdreamOptions = withMinimalPreset({
        origin: finalOrigin,
      });

      const markdown = htmlToMarkdown(html, mdreamOptions);

      const markdownSize = markdown.length;
      const fetchTime = Date.now() - startTime;

      return {
        url,
        title,
        content: markdown,
        length: markdown.length,
        success: true,
        metadata: {
          fetchTime,
          originalSize,
          markdownSize,
          compressionRatio: markdownSize / originalSize,
          statusCode: response.status,
        },
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    const fetchTime = Date.now() - startTime;

    return {
      url,
      title: '',
      content: '',
      length: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        fetchTime,
        originalSize: 0,
        markdownSize: 0,
        compressionRatio: 0,
        statusCode:
          error instanceof Error && error.message.includes('HTTP')
            ? parseInt(error.message.match(/HTTP (\d+)/)?.[1] || '0', 10)
            : undefined,
      },
    };
  }
}

/**
 * Fetches multiple webpages in parallel and returns results
 */
export async function fetchMultipleWebpagesToMarkdown(
  urls: string[],
  options: WebpageFetchOptions = {},
): Promise<WebpageFetchResult[]> {
  const promises = urls.map((url) => fetchWebpageToMarkdown(url, options));
  return Promise.all(promises);
}

/**
 * Creates a summary of webpage fetch results
 */
export function summarizeFetchResults(results: WebpageFetchResult[]): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  let summary = `## Webpage Fetch Summary\n\n`;
  summary += `- **Total URLs**: ${results.length}\n`;
  summary += `- **Successful**: ${successful.length}\n`;
  summary += `- **Failed**: ${failed.length}\n\n`;

  if (successful.length > 0) {
    summary += `### Successful Fetches:\n\n`;
    successful.forEach((result) => {
      summary += `- **${result.title || 'No title'}** (${result.url})\n`;
      summary += `  - Content length: ${result.length} characters\n`;
      summary += `  - Fetch time: ${result.metadata.fetchTime}ms\n`;
      summary += `  - Compression: ${(result.metadata.compressionRatio * 100).toFixed(1)}%\n`;
      if (result.metadata.statusCode) {
        summary += `  - Status code: ${result.metadata.statusCode}\n`;
      }
    });
    summary += '\n';
  }

  if (failed.length > 0) {
    summary += `### Failed Fetches:\n\n`;
    failed.forEach((result) => {
      summary += `- ${result.url}: ${result.error}\n`;
    });
  }

  return summary;
}
