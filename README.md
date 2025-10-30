# DuckDuckGo Search Scraper

TypeScript wrapper for scraping DuckDuckGo results from the lite HTML endpoint.

## Getting Started

```bash
npm install
npm run build
```

## Usage

```ts
import { searchDuckDuckGo } from 'duckduckgo-search';

const results = await searchDuckDuckGo('privacy focused search');

console.log(results);
/*
[
  {
    title: 'DuckDuckGo — Privacy, simplified.',
    url: 'https://duckduckgo.com/',
    description: 'DuckDuckGo is an internet search engine...'
  },
  ...
]
*/
```

### Options

```ts
await searchDuckDuckGo('typescript', {
  maxResults: 20,
  locale: 'us-en',
  safeSearch: 'strict',
});
```

- `maxResults` – Maximum number of results to return (default `10`).
- `locale` – Locale string passed as the `kl` parameter (`us-en`, `pt-pt`, etc.).
- `safeSearch` – Safe-search level (`off`, `moderate`, `strict`).
- `offset` – Result offset in multiples of 50, passed as the `s` parameter.
- `userAgent` – Custom user-agent header.
- `signal` – `AbortSignal` used to cancel the underlying fetch.

## Testing

```bash
npm test
```
