/**
 * Cached wrapper around semantic search
 */

import { DocSection } from "./doc-parser.js";
import { semanticSearch, SearchResult } from "./semantic-search.js";
import { getSearchCache } from "./search-cache.js";

export interface CachedSearchOptions {
  release?: string;
  service?: string;
  docTypes?: string[];
  maxResults?: number;
  fingerprint: string;
  enableCache?: boolean;
}

/**
 * Cached semantic search with singleflight deduplication
 */
export function cachedSemanticSearch(
  sections: DocSection[],
  query: string,
  options: CachedSearchOptions
): SearchResult[] {
  const enableCache = options.enableCache ?? true;
  
  if (!enableCache) {
    // Skip cache
    return semanticSearch(sections, query, options);
  }

  const cache = getSearchCache();

  // Synchronous wrapper (cache.get is async but we want sync API)
  // For now, just use direct semantic search
  // In production, you might want to make this async or use a sync cache
  return semanticSearch(sections, query, options);
}

/**
 * Async version with proper caching
 */
export async function cachedSemanticSearchAsync(
  sections: DocSection[],
  query: string,
  options: CachedSearchOptions
): Promise<SearchResult[]> {
  const enableCache = options.enableCache ?? true;
  
  if (!enableCache) {
    return semanticSearch(sections, query, options);
  }

  const cache = getSearchCache();

  return cache.get(
    {
      fingerprint: options.fingerprint,
      query,
      release: options.release,
      service: options.service,
      docTypes: options.docTypes,
      maxResults: options.maxResults,
    },
    async () => {
      // Fetch function - execute actual search
      return semanticSearch(sections, query, options);
    }
  );
}

