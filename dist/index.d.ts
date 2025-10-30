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
export declare class DuckDuckGoSearchError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Performs a DuckDuckGo search by scraping the lite HTML endpoint.
 *
 * @throws {DuckDuckGoSearchError} When the request fails or the response cannot be parsed.
 */
export declare function searchDuckDuckGo(query: string, options?: DuckDuckGoSearchOptions): Promise<DuckDuckGoSearchResult>;
