import { load } from 'cheerio';

export interface DuckDuckGoResult {
  title: string;
  url: string;
  description: string;
}

export type DuckDuckGoSafeSearch = 'off' | 'moderate' | 'strict';

export interface DuckDuckGoSearchOptions {
  /**
   * Two-letter language-region code (`kl` parameter), e.g. `us-en` or `pt-pt`.
   * Defaults to DuckDuckGo's auto-detected locale.
   */
  locale?: string;
  /**
   * When provided, offsets results (`s` parameter). DuckDuckGo expects multiples of 50.
   */
  offset?: number;
  /**
   * DuckDuckGo safe-search level (`kp` parameter).
   *
   * - `off`: disables safe-search (kp=-2)
   * - `moderate`: default DuckDuckGo behavior (kp=0)
   * - `strict`: strict filtering (kp=1)
   */
  safeSearch?: DuckDuckGoSafeSearch;
  /**
   * Maximum amount of results to return. Defaults to 10.
   */
  maxResults?: number;
  /**
   * Overrides the user-agent header. Defaults to a desktop browser user-agent.
   */
  userAgent?: string;
  /**
   * Optional AbortSignal for cancelling the underlying fetch call.
   */
  signal?: AbortSignal;
}

export type DuckDuckGoSearchResult = DuckDuckGoResult[];

const DUCKDUCKGO_HTML_ENDPOINT = 'https://duckduckgo.com/html/';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const SAFE_SEARCH_PARAM: Record<DuckDuckGoSafeSearch, string> = {
  off: '-2',
  moderate: '0',
  strict: '1',
};

/** Maximum number of retries for exponential backoff */
const MAX_RETRIES = 5;

export class DuckDuckGoSearchError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DuckDuckGoSearchError';
  }
}

/**
 * Get the exponential backoff delay.
 * @param attempt Attempt number
 * @param baseDelay THe base delay (defaults to 100)
 * @param maxDelay  The maximum delay (defaults to 120_000)
 * @returns The exponential backoff delay
 */
function getExponentialBackoffDelay(
  attempt: number,
  baseDelay: number = 100,
  maxDelay: number = 120_000,
): number {
  // Add random jitter between 0 and baseDelay
  const jitter = Math.random() * baseDelay;

  // Exponential backoff formula
  const delay = Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);

  return delay;
}

/**
 * Performs a DuckDuckGo search by scraping the lite HTML endpoint.
 *
 * @throws {DuckDuckGoSearchError} When the request fails or the response cannot be parsed.
 */
export async function searchDuckDuckGo(
  query: string,
  options: DuckDuckGoSearchOptions = {},
): Promise<DuckDuckGoSearchResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new DuckDuckGoSearchError('Search query must not be empty');
  }

  const { userAgent = DEFAULT_USER_AGENT } = options;
  const maxResults = options.maxResults ?? 10;

  if (maxResults <= 0) {
    throw new DuckDuckGoSearchError('maxResults must be greater than 0');
  }

  try {
    // loop to get result
    for (let i = 0; i < MAX_RETRIES; i++) {
      const html = await requestSearchPage(trimmedQuery, options, userAgent);

      // verify challenge
      if (html.includes('challenge-form')) {
        await new Promise((resolve) => setTimeout(resolve, getExponentialBackoffDelay(i)));

        continue;
      }

      return parseResults(html, maxResults);
    }

    throw new DuckDuckGoSearchError('Max attempts exceeded');
  } catch (error) {
    throw new DuckDuckGoSearchError('Failed to search DuckDuckGo', error);
  }
}

async function requestSearchPage(
  query: string,
  options: DuckDuckGoSearchOptions,
  userAgent: string,
): Promise<string> {
  const url = buildSearchUrl(query, options);
  const response = await fetch(url, {
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml',
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo responded with status ${response.status}`);
  }

  return response.text();
}

function buildSearchUrl(query: string, options: DuckDuckGoSearchOptions): string {
  const params = new URLSearchParams();
  params.set('q', query);

  if (options.locale) {
    params.set('kl', options.locale);
  }

  if (typeof options.offset === 'number') {
    params.set('s', Math.max(0, options.offset).toString());
  }

  if (options.safeSearch) {
    params.set('kp', SAFE_SEARCH_PARAM[options.safeSearch]);
  }

  return `${DUCKDUCKGO_HTML_ENDPOINT}?${params.toString()}`;
}

function parseResults(html: string, maxResults: number): DuckDuckGoSearchResult {
  const $ = load(html);
  const results: DuckDuckGoResult[] = [];

  $('div.result').each((_, element) => {
    if (results.length >= maxResults) {
      return false;
    }

    const titleAnchor = $('a.result__a', element).first();
    const descriptionBlock = $('.result__snippet', element).first();

    const href = titleAnchor.attr('href');
    const title = titleAnchor.text().trim();
    const description = descriptionBlock.text().trim();

    if (!href || !title) {
      return;
    }

    const url = extractUrl(href);
    if (!url) {
      return;
    }

    results.push({ title, url, description });
  });

  return results;
}

function extractUrl(rawHref: string): string | undefined {
  try {
    if (rawHref.startsWith('/')) {
      const [, queryString] = rawHref.split('?');
      if (!queryString) {
        return undefined;
      }

      const params = new URLSearchParams(queryString);
      const encodedUrl = params.get('uddg') ?? params.get('rut');

      if (!encodedUrl) {
        return undefined;
      }

      return decodeURIComponent(encodedUrl);
    }

    return rawHref;
  } catch {
    return undefined;
  }
}
