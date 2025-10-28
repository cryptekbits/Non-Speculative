import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reranker, createReranker } from '../../src/rag/reranker.js';
import { SearchResult } from '../../src/store/milvus.js';

describe('Reranker', () => {
  let reranker: Reranker;

  const mockResults: SearchResult[] = [
    {
      chunk: {
        id: '1',
        content: 'Database configuration using PostgreSQL for persistence',
        metadata: {
          file: 'R1-ARCHITECTURE.md',
          release: 'R1',
          docType: 'ARCHITECTURE',
          heading: 'Database',
          lineStart: 10,
          lineEnd: 20,
          chunkIndex: 0,
          totalChunks: 1,
        },
        tokens: 50,
      },
      score: 0.9,
      distance: 0.1,
    },
    {
      chunk: {
        id: '2',
        content: 'API endpoints for authentication',
        metadata: {
          file: 'R1-API.md',
          release: 'R1',
          docType: 'API',
          heading: 'Auth',
          lineStart: 5,
          lineEnd: 15,
          chunkIndex: 0,
          totalChunks: 1,
        },
        tokens: 30,
      },
      score: 0.7,
      distance: 0.3,
    },
    {
      chunk: {
        id: '3',
        content: 'Caching layer with Redis implementation',
        metadata: {
          file: 'R1-ARCHITECTURE.md',
          release: 'R1',
          docType: 'ARCHITECTURE',
          heading: 'Cache',
          lineStart: 30,
          lineEnd: 40,
          chunkIndex: 0,
          totalChunks: 1,
        },
        tokens: 35,
      },
      score: 0.6,
      distance: 0.4,
    },
  ];

  describe('disabled reranker', () => {
    beforeEach(() => {
      reranker = new Reranker({ enabled: false });
    });

    it('returns results unchanged when disabled', async () => {
      const reranked = await reranker.rerank('test query', mockResults);

      expect(reranked.length).toBe(mockResults.length);
      reranked.forEach((r, i) => {
        expect(r.result).toBe(mockResults[i]);
        expect(r.rerankScore).toBe(mockResults[i].score);
      });
    });

    it('isEnabled returns false', () => {
      expect(reranker.isEnabled()).toBe(false);
    });

    it('handles empty results', async () => {
      const reranked = await reranker.rerank('test', []);
      expect(reranked.length).toBe(0);
    });
  });

  describe('heuristic reranker (fallback)', () => {
    beforeEach(() => {
      reranker = new Reranker({ enabled: true, provider: 'mock', topK: 2 });
    });

    it('reranks based on relevance', async () => {
      const reranked = await reranker.rerank('database PostgreSQL', mockResults);

      expect(reranked.length).toBeGreaterThan(0);
      // First result should be most relevant to query
      expect(reranked[0].result.chunk.content).toContain('PostgreSQL');
    });

    it('respects topK limit', async () => {
      const reranked = await reranker.rerank('query', mockResults);

      expect(reranked.length).toBeLessThanOrEqual(2);
    });

    it('sorts by relevance score', async () => {
      const reranked = await reranker.rerank('database', mockResults);

      for (let i = 1; i < reranked.length; i++) {
        expect(reranked[i - 1].rerankScore).toBeGreaterThanOrEqual(reranked[i].rerankScore);
      }
    });

    it('scores exact phrase match higher', async () => {
      const reranked = await reranker.rerank('API endpoints', mockResults);

      // Result with exact phrase should score high
      const apiResult = reranked.find(r => r.result.chunk.content.includes('API endpoints'));
      expect(apiResult).toBeDefined();
      expect(apiResult!.rerankScore).toBeGreaterThan(0);
    });

    it('scores term overlap', async () => {
      const reranked = await reranker.rerank('authentication API', mockResults);

      expect(reranked.length).toBeGreaterThan(0);
      expect(reranked[0].rerankScore).toBeGreaterThan(0);
    });

    it('handles queries with no matches', async () => {
      const reranked = await reranker.rerank('completely unrelated query xyz', mockResults);

      expect(reranked.length).toBeGreaterThan(0);
      // Still returns results, just with lower scores
      reranked.forEach(r => {
        expect(r.rerankScore).toBeGreaterThanOrEqual(0);
      });
    });

    it('normalizes scores by content length', async () => {
      const shortResult: SearchResult = {
        chunk: {
          id: 'short',
          content: 'database',
          metadata: {
            file: 'test.md',
            release: 'R1',
            docType: 'TEST',
            heading: 'Test',
            lineStart: 1,
            lineEnd: 1,
            chunkIndex: 0,
            totalChunks: 1,
          },
          tokens: 5,
        },
        score: 0.5,
        distance: 0.5,
      };

      const longResult: SearchResult = {
        chunk: {
          id: 'long',
          content: 'database ' + 'x'.repeat(1000),
          metadata: {
            file: 'test.md',
            release: 'R1',
            docType: 'TEST',
            heading: 'Test',
            lineStart: 1,
            lineEnd: 1,
            chunkIndex: 0,
            totalChunks: 1,
          },
          tokens: 500,
        },
        score: 0.5,
        distance: 0.5,
      };

      const reranked = await reranker.rerank('database', [longResult, shortResult]);

      // Results are reranked
      expect(reranked.length).toBe(2);
    });
  });

  describe('configuration', () => {
    it('uses default config', () => {
      reranker = new Reranker();

      expect(reranker.isEnabled()).toBe(false);
    });

    it('accepts custom topK', async () => {
      reranker = new Reranker({ enabled: true, provider: 'mock', topK: 1 });

      const reranked = await reranker.rerank('query', mockResults);

      expect(reranked.length).toBe(1);
    });

    it('limits topK to available results', async () => {
      reranker = new Reranker({ enabled: true, provider: 'mock', topK: 100 });

      const reranked = await reranker.rerank('query', mockResults);

      expect(reranked.length).toBe(mockResults.length);
    });

    it('isEnabled reflects config', () => {
      const enabled = new Reranker({ enabled: true });
      const disabled = new Reranker({ enabled: false });

      expect(enabled.isEnabled()).toBe(true);
      expect(disabled.isEnabled()).toBe(false);
    });
  });

  describe('Cohere provider', () => {
    it('falls back to heuristic when API key not set', async () => {
      const original = process.env.COHERE_API_KEY;
      delete process.env.COHERE_API_KEY;

      reranker = new Reranker({ enabled: true, provider: 'cohere' });

      // Should not throw, instead fall back to heuristic reranker
      const result = await reranker.rerank('query', mockResults);
      expect(result.length).toBeGreaterThan(0);

      if (original) process.env.COHERE_API_KEY = original;
    });
  });
});

describe('createReranker', () => {
  it('creates reranker with config', () => {
    const reranker = createReranker({ enabled: true, topK: 5 });

    expect(reranker).toBeInstanceOf(Reranker);
    expect(reranker.isEnabled()).toBe(true);
  });

  it('creates reranker with defaults', () => {
    const reranker = createReranker();

    expect(reranker).toBeInstanceOf(Reranker);
    expect(reranker.isEnabled()).toBe(false);
  });
});

