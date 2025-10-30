import { load } from 'cheerio';
const DUCKDUCKGO_HTML_ENDPOINT = 'https://duckduckgo.com/html/';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const SAFE_SEARCH_PARAM = {
    off: '-2',
    moderate: '0',
    strict: '1',
};
export class DuckDuckGoSearchError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'DuckDuckGoSearchError';
    }
}
/**
 * Performs a DuckDuckGo search by scraping the lite HTML endpoint.
 *
 * @throws {DuckDuckGoSearchError} When the request fails or the response cannot be parsed.
 */
export async function searchDuckDuckGo(query, options = {}) {
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
        const html = await requestSearchPage(trimmedQuery, options, userAgent);
        return parseResults(html, maxResults);
    }
    catch (error) {
        throw new DuckDuckGoSearchError('Failed to search DuckDuckGo', error);
    }
}
async function requestSearchPage(query, options, userAgent) {
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
function buildSearchUrl(query, options) {
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
function parseResults(html, maxResults) {
    const $ = load(html);
    const results = [];
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
function extractUrl(rawHref) {
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
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=index.js.map