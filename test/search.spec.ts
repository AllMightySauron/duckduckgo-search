import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { searchDuckDuckGo } from '../src/index.js';

const htmlFixture = `
<!DOCTYPE html>
<html lang="en">
  <body>
    <div class="results">
      <div class="result">
        <h2 class="result__title">
          <a class="result__a" href="/l/?kh=1&uddg=https%3A%2F%2Fexample.com%2Flink">Example Domain</a>
        </h2>
        <div class="result__snippet">
          This domain is for use in illustrative examples in documents.
        </div>
      </div>
    </div>
  </body>
</html>
`;

const originalFetch = globalThis.fetch;

describe('searchDuckDuckGo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws when query is empty', async () => {
    await expect(searchDuckDuckGo('   ')).rejects.toThrowError(/must not be empty/);
  });

  it('parses search results from DuckDuckGo lite HTML', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlFixture,
      headers: {
        get: () => null,
        getSetCookie: () => [],
      },
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const results = await searchDuckDuckGo('example');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Example Domain',
      url: 'https://example.com/link',
      description:
        'This domain is for use in illustrative examples in documents.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://duckduckgo.com/html/?q=example'),
      expect.objectContaining({
        headers: expect.any(Object),
      }),
    );
  });

  it('reuses session cookies between sequential searches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => htmlFixture,
        headers: {
          get: () => null,
          getSetCookie: () => ['session=123; Path=/; Max-Age=31536000'],
        },
      })
      .mockResolvedValue({
        ok: true,
        text: async () => htmlFixture,
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await searchDuckDuckGo('example');
    await searchDuckDuckGo('example');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;

    expect(secondCallHeaders.cookie).toContain('session=123');
  });
});
