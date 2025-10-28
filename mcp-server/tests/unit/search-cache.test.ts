import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchCache, getSearchCache, clearGlobalSearchCache } from '../../src/utils/search-cache.js';
import { SearchResult } from '../../src/utils/semantic-search.js';

describe('SearchCache', () => {
  let cache: SearchCache;

  beforeEach(() => {
    cache = new SearchCache({ maxSize: 10, ttlMs: 1000 });
  });

  const mockResults: SearchResult[] = [
    {
      section: {
        file: 'R1-ARCHITECTURE.md',
        release: 'R1',
        docType: 'ARCHITECTURE',
        heading: 'Test',
        content: 'Test content',
        lineStart: 1,
        lineEnd: 10,
      },
      score: 0.9,
    },
  ];

  it('caches results on first fetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);
    const key = { fingerprint: 'fp1', query: 'test query' };

    const result = await cache.get(key, fetchFn);

    expect(result).toEqual(mockResults);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  it('returns cached results on second fetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);
    const key = { fingerprint: 'fp1', query: 'test query' };

    await cache.get(key, fetchFn);
    const result = await cache.get(key, fetchFn);

    expect(result).toEqual(mockResults);
    expect(fetchFn).toHaveBeenCalledTimes(1); // Only called once

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('deduplicates concurrent identical requests (singleflight)', async () => {
    let resolveCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      resolveCount++;
      return mockResults;
    });

    const key = { fingerprint: 'fp1', query: 'concurrent' };

    // Fire multiple concurrent requests
    const [result1, result2, result3] = await Promise.all([
      cache.get(key, fetchFn),
      cache.get(key, fetchFn),
      cache.get(key, fetchFn),
    ]);

    expect(result1).toEqual(mockResults);
    expect(result2).toEqual(mockResults);
    expect(result3).toEqual(mockResults);
    
    // fetchFn should only be called once
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(resolveCount).toBe(1);

    const stats = cache.getStats();
    expect(stats.inflightHits).toBe(2); // Two requests hit inflight
  });

  it('serializes keys with different filters', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    const key1 = { fingerprint: 'fp1', query: 'test', release: 'R1' };
    const key2 = { fingerprint: 'fp1', query: 'test', release: 'R2' };
    const key3 = { fingerprint: 'fp1', query: 'test' };

    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);
    await cache.get(key3, fetchFn);

    // All should be cache misses (different keys)
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('normalizes query to lowercase in key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    const key1 = { fingerprint: 'fp1', query: 'Test Query' };
    const key2 = { fingerprint: 'fp1', query: 'test query' };

    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);

    // Should be same key (query normalized)
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('includes docTypes in key serialization', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    const key1 = { fingerprint: 'fp1', query: 'test', docTypes: ['ARCHITECTURE', 'DESIGN'] };
    const key2 = { fingerprint: 'fp1', query: 'test', docTypes: ['DESIGN', 'ARCHITECTURE'] };
    const key3 = { fingerprint: 'fp1', query: 'test', docTypes: ['ARCHITECTURE'] };

    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);
    await cache.get(key3, fetchFn);

    // key1 and key2 should be same (sorted), key3 different
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('includes maxResults in key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    const key1 = { fingerprint: 'fp1', query: 'test', maxResults: 10 };
    const key2 = { fingerprint: 'fp1', query: 'test', maxResults: 20 };

    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('invalidates cache by fingerprint', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    const key1 = { fingerprint: 'fp1', query: 'test1' };
    const key2 = { fingerprint: 'fp1', query: 'test2' };
    const key3 = { fingerprint: 'fp2', query: 'test3' };

    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);
    await cache.get(key3, fetchFn);

    const invalidated = cache.invalidateFingerprint('fp1');

    expect(invalidated).toBe(2);

    // Next fetch for fp1 keys should be cache miss
    fetchFn.mockClear();
    await cache.get(key1, fetchFn);
    await cache.get(key3, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1); // Only key1 (key3 still cached)
  });

  it('clears entire cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    const key1 = { fingerprint: 'fp1', query: 'test1' };
    const key2 = { fingerprint: 'fp2', query: 'test2' };

    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);

    cache.clear();

    fetchFn.mockClear();
    await cache.get(key1, fetchFn);
    await cache.get(key2, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2); // Both are cache misses
  });

  it('handles fetch errors correctly', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => {
      throw new Error('Fetch failed');
    });

    const key = { fingerprint: 'fp1', query: 'test' };

    await expect(cache.get(key, fetchFn)).rejects.toThrow('Fetch failed');

    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
  });

  it('allows retry after error', async () => {
    const fetchFn = vi.fn()
      .mockImplementationOnce(async () => {
        throw new Error('First fail');
      })
      .mockResolvedValueOnce(mockResults);

    const key = { fingerprint: 'fp1', query: 'test' };

    await expect(cache.get(key, fetchFn)).rejects.toThrow('First fail');
    
    const result = await cache.get(key, fetchFn);
    expect(result).toEqual(mockResults);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('respects TTL expiration', async () => {
    const shortCache = new SearchCache({ maxSize: 10, ttlMs: 50 });
    const fetchFn = vi.fn().mockResolvedValue(mockResults);
    const key = { fingerprint: 'fp1', query: 'test' };

    await shortCache.get(key, fetchFn);
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 100));

    await shortCache.get(key, fetchFn);

    // Should be called twice (once initial, once after expiry)
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('tracks cache statistics correctly', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);
    const key = { fingerprint: 'fp1', query: 'test' };

    // First fetch - miss
    await cache.get(key, fetchFn);
    let stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0);

    // Second fetch - hit
    await cache.get(key, fetchFn);
    stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);

    // Third fetch - hit
    await cache.get(key, fetchFn);
    stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.666, 2);
  });

  it('resets statistics', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResults);
    const key = { fingerprint: 'fp1', query: 'test' };

    await cache.get(key, fetchFn);
    await cache.get(key, fetchFn);

    cache.resetStats();

    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.inflightHits).toBe(0);
  });

  it('respects max size limit (LRU)', async () => {
    const smallCache = new SearchCache({ maxSize: 3, ttlMs: 10000 });
    const fetchFn = vi.fn().mockResolvedValue(mockResults);

    // Add 4 entries to cache of size 3
    await smallCache.get({ fingerprint: 'fp1', query: 'q1' }, fetchFn);
    await smallCache.get({ fingerprint: 'fp1', query: 'q2' }, fetchFn);
    await smallCache.get({ fingerprint: 'fp1', query: 'q3' }, fetchFn);
    await smallCache.get({ fingerprint: 'fp1', query: 'q4' }, fetchFn);

    const stats = smallCache.getStats();
    expect(stats.size).toBeLessThanOrEqual(3);

    // First entry should be evicted (LRU)
    fetchFn.mockClear();
    await smallCache.get({ fingerprint: 'fp1', query: 'q1' }, fetchFn);
    expect(fetchFn).toHaveBeenCalled(); // Cache miss (evicted)
  });
});

describe('Global cache', () => {
  beforeEach(() => {
    clearGlobalSearchCache();
  });

  it('returns same instance on multiple calls', () => {
    const cache1 = getSearchCache();
    const cache2 = getSearchCache();

    expect(cache1).toBe(cache2);
  });

  it('clears global cache', async () => {
    const cache = getSearchCache();
    const fetchFn = vi.fn().mockResolvedValue([]);
    const key = { fingerprint: 'fp1', query: 'test' };

    await cache.get(key, fetchFn);
    clearGlobalSearchCache();

    fetchFn.mockClear();
    const newCache = getSearchCache();
    await newCache.get(key, fetchFn);

    expect(fetchFn).toHaveBeenCalled(); // Should fetch again after clear
  });
});

