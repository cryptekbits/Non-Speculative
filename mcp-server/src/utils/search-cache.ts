/**
 * LRU+TTL cache for search results with singleflight deduplication
 */

import { LRUCache } from "lru-cache";
import { SearchResult } from "./semantic-search.js";

export interface SearchCacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

interface CacheKey {
  fingerprint: string;
  query: string;
  release?: string;
  service?: string;
  docTypes?: string[];
  maxResults?: number;
}

interface InflightRequest {
  promise: Promise<SearchResult[]>;
  resolve: (value: SearchResult[]) => void;
  reject: (reason: any) => void;
}

const DEFAULT_OPTIONS = {
  maxSize: 1000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

export class SearchCache {
  private cache: LRUCache<string, SearchResult[]>;
  private inflight: Map<string, InflightRequest> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    inflightHits: 0,
  };

  constructor(options?: SearchCacheOptions) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    this.cache = new LRUCache<string, SearchResult[]>({
      max: opts.maxSize,
      ttl: opts.ttlMs,
    });
  }

  /**
   * Get cached result or execute fetch function (with singleflight)
   */
  async get(
    key: CacheKey,
    fetchFn: () => Promise<SearchResult[]>
  ): Promise<SearchResult[]> {
    const cacheKey = this.serializeKey(key);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.stats.hits++;
      return cached;
    }

    // Check if request is already in-flight
    const existing = this.inflight.get(cacheKey);
    if (existing) {
      this.stats.inflightHits++;
      return existing.promise;
    }

    // Create new in-flight request
    let resolve: (value: SearchResult[]) => void;
    let reject: (reason: any) => void;

    const promise = new Promise<SearchResult[]>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    
    // Add no-op catch to prevent unhandled rejection warnings
    // The error is always re-thrown by the calling context
    promise.catch(() => {});

    const inflight: InflightRequest = {
      promise,
      resolve: resolve!,
      reject: reject!,
    };

    this.inflight.set(cacheKey, inflight);

    try {
      this.stats.misses++;
      const results = await fetchFn();
      
      // Cache the results
      this.cache.set(cacheKey, results);
      
      // Resolve inflight request
      inflight.resolve(results);
      
      return results;
    } catch (error) {
      // Reject inflight request
      inflight.reject(error);
      throw error;
    } finally {
      // Clean up inflight
      this.inflight.delete(cacheKey);
    }
  }

  /**
   * Serialize cache key to string
   */
  private serializeKey(key: CacheKey): string {
    const parts = [
      key.fingerprint,
      key.query.toLowerCase(),
    ];

    if (key.release) parts.push(`r:${key.release}`);
    if (key.service) parts.push(`s:${key.service}`);
    if (key.docTypes && key.docTypes.length > 0) {
      parts.push(`dt:${key.docTypes.sort().join(',')}`);
    }
    if (key.maxResults) parts.push(`max:${key.maxResults}`);

    return parts.join('|');
  }

  /**
   * Invalidate all cache entries for a fingerprint
   */
  invalidateFingerprint(fingerprint: string): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(fingerprint + '|')) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    inflightHits: number;
    size: number;
    hitRate: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      inflightHits: this.stats.inflightHits,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      inflightHits: 0,
    };
  }
}

// Global singleton
let globalCache: SearchCache | null = null;

/**
 * Get or create global search cache
 */
export function getSearchCache(options?: SearchCacheOptions): SearchCache {
  if (!globalCache) {
    globalCache = new SearchCache(options);
  }
  return globalCache;
}

/**
 * Clear global cache
 */
export function clearGlobalSearchCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
}

