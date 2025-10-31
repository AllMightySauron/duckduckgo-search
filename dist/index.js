import { load } from 'cheerio';
const DUCKDUCKGO_HTML_ENDPOINT = 'https://duckduckgo.com/html/';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const SAFE_SEARCH_PARAM = {
    off: '-2',
    moderate: '0',
    strict: '1',
};
/** Maximum number of retries for exponential backoff */
const MAX_RETRIES = 5;
/** Minimum gap enforced between two outbound requests */
const MIN_REQUEST_INTERVAL_MS = 800;
/** Additional random delay to avoid a perfectly regular cadence */
const REQUEST_JITTER_MS = 200;
const sessionCookies = new Map();
let lastRequestTimestamp = 0;
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class DuckDuckGoSearchError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
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
function getExponentialBackoffDelay(attempt, baseDelay = 100, maxDelay = 120_000) {
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
    }
    catch (error) {
        throw new DuckDuckGoSearchError('Failed to search DuckDuckGo', error);
    }
}
async function requestSearchPage(query, options, userAgent) {
    const url = buildSearchUrl(query, options);
    await enforceRequestInterval();
    const headers = {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'accept-language': 'en-US,en;q=0.9',
        referer: 'https://duckduckgo.com/',
    };
    const cookieHeader = buildCookieHeader();
    if (cookieHeader) {
        headers.cookie = cookieHeader;
    }
    const response = await fetch(url, {
        headers,
        signal: options.signal,
    });
    storeResponseCookies(response.headers);
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
async function enforceRequestInterval() {
    const now = Date.now();
    if (lastRequestTimestamp) {
        const elapsed = now - lastRequestTimestamp;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            const jitter = Math.random() * REQUEST_JITTER_MS;
            await delay(MIN_REQUEST_INTERVAL_MS - elapsed + jitter);
        }
    }
    lastRequestTimestamp = Date.now();
}
function storeResponseCookies(headers) {
    const possibleCookies = (headers.getSetCookie?.() ?? []);
    if (possibleCookies.length > 0) {
        updateCookieJar(possibleCookies);
        return;
    }
    const headerValue = headers.get('set-cookie');
    if (!headerValue) {
        return;
    }
    const cookies = headerValue.split(/,(?=[^;]+=[^;]+)/).map((value) => value.trim());
    updateCookieJar(cookies);
}
function updateCookieJar(cookies) {
    for (const cookie of cookies) {
        const [name, value] = parseCookie(cookie) ?? [];
        if (!name) {
            continue;
        }
        if (!value || value.toLowerCase() === 'deleted') {
            sessionCookies.delete(name);
            continue;
        }
        sessionCookies.set(name, value);
    }
}
function parseCookie(cookie) {
    const [nameValue] = cookie.split(';');
    if (!nameValue?.includes('=')) {
        return null;
    }
    const separatorIndex = nameValue.indexOf('=');
    if (separatorIndex === -1) {
        return null;
    }
    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1).trim();
    if (!name) {
        return null;
    }
    return [name, value];
}
function buildCookieHeader() {
    if (sessionCookies.size === 0) {
        return undefined;
    }
    return Array.from(sessionCookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
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