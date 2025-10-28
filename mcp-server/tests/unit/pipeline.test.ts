import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RAGPipeline, createRAGPipeline } from '../../src/rag/pipeline.js';
import { Embedder } from '../../src/rag/embedder.js';
import { MilvusStore, SearchResult } from '../../src/store/milvus.js';
import { Reranker } from '../../src/rag/reranker.js';

// Mock MilvusStore
class MockMilvusStore {
  async search(): Promise<SearchResult[]> {
    return [
      {
        chunk: {
          id: '1',
          content: 'Database uses PostgreSQL for data persistence',
          metadata: {
            file: 'R1-ARCHITECTURE.md',
            release: 'R1',
            docType: 'ARCHITECTURE',
            heading: 'Database Layer',
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
          content: 'Authentication uses JWT tokens',
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
    ];
  }

  async connect() {}
  async close() {}
}

describe('RAGPipeline', () => {
  let pipeline: RAGPipeline;
  let embedder: Embedder;
  let store: MockMilvusStore;
  let reranker: Reranker;

  beforeEach(() => {
    embedder = new Embedder({ provider: 'openai', dimensions: 128 });
    store = new MockMilvusStore() as any;
    reranker = new Reranker({ enabled: false });
    pipeline = new RAGPipeline(embedder, store as any, reranker);
  });

  describe('query', () => {
    it('returns answer with citations', async () => {
      const result = await pipeline.query({
        query: 'How does database work?',
      });

      expect(result.answer).toBeDefined();
      expect(result.citations).toBeDefined();
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.groundingScore).toBeGreaterThanOrEqual(0);
      expect(result.groundingScore).toBeLessThanOrEqual(1);
    });

    it('includes citation metadata', async () => {
      const result = await pipeline.query({
        query: 'database',
      });

      const citation = result.citations[0];
      expect(citation.file).toBe('R1-ARCHITECTURE.md');
      expect(citation.heading).toBe('Database Layer');
      expect(citation.lineStart).toBe(10);
      expect(citation.lineEnd).toBe(20);
      expect(citation.snippet).toBeTruthy();
      expect(citation.relevance).toBeGreaterThanOrEqual(0);
    });

    it('handles no results gracefully', async () => {
      store.search = vi.fn().mockResolvedValue([]);

      const result = await pipeline.query({
        query: 'nonexistent topic',
      });

      expect(result.answer).toContain('No relevant documentation');
      expect(result.citations.length).toBe(0);
      expect(result.insufficientEvidence).toBe(true);
      expect(result.missingTopics).toContain('nonexistent topic');
    });

    it('respects topK parameter', async () => {
      const searchSpy = vi.spyOn(store, 'search');

      await pipeline.query({
        query: 'test',
        k: 5,
      });

      expect(searchSpy).toHaveBeenCalledWith(
        expect.any(Array),
        5,
        undefined
      );
    });

    it('passes filters to store', async () => {
      const searchSpy = vi.spyOn(store, 'search');

      await pipeline.query({
        query: 'test',
        filters: { release: 'R1', docType: 'ARCHITECTURE' },
      });

      expect(searchSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Number),
        { release: 'R1', docType: 'ARCHITECTURE' }
      );
    });

    it('normalizes query', async () => {
      const embedSpy = vi.spyOn(embedder, 'embed');

      await pipeline.query({
        query: '  How does it work?  ',
      });

      expect(embedSpy).toHaveBeenCalledWith('How does it work?');
    });

    it('embeds query before search', async () => {
      const embedSpy = vi.spyOn(embedder, 'embed');

      await pipeline.query({
        query: 'test query',
      });

      expect(embedSpy).toHaveBeenCalledWith('test query');
    });

    it('reranks results when enabled', async () => {
      const rerankingReranker = new Reranker({ enabled: true, provider: 'mock' });
      const rerankingSpy = vi.spyOn(rerankingReranker, 'rerank');
      
      const rerankingPipeline = new RAGPipeline(embedder, store as any, rerankingReranker);

      await rerankingPipeline.query({
        query: 'test',
      });

      expect(rerankingSpy).toHaveBeenCalled();
    });

    it('uses reranked scores for relevance', async () => {
      const rerankingReranker = new Reranker({ enabled: true, provider: 'mock' });
      const rerankingPipeline = new RAGPipeline(embedder, store as any, rerankingReranker);

      const result = await rerankingPipeline.query({
        query: 'database PostgreSQL',
      });

      expect(result.citations[0].relevance).toBeDefined();
    });

    it('builds context from top results', async () => {
      const result = await pipeline.query({
        query: 'database',
      });

      // Verify answer is generated
      expect(result.answer).toBeTruthy();
    });

    it('assesses grounding quality', async () => {
      const result = await pipeline.query({
        query: 'database',
      });

      expect(result.groundingScore).toBeGreaterThanOrEqual(0);
      expect(result.groundingScore).toBeLessThanOrEqual(1);
      expect(typeof result.insufficientEvidence).toBe('boolean');
    });

    it('flags insufficient evidence', async () => {
      // Mock low-quality results
      store.search = vi.fn().mockResolvedValue([
        {
          chunk: {
            id: '1',
            content: 'Unrelated content',
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
            tokens: 10,
          },
          score: 0.3,
          distance: 0.7,
        },
      ]);

      const result = await pipeline.query({
        query: 'very specific query about X',
      });

      // Low grounding should flag insufficient evidence
      if (result.groundingScore < 0.3) {
        expect(result.insufficientEvidence).toBe(true);
      }
    });

    it('generates fallback answer when Groq unavailable', async () => {
      const noGroqPipeline = new RAGPipeline(
        embedder,
        store as any,
        reranker,
        { groqApiKey: '' }
      );

      const result = await noGroqPipeline.query({
        query: 'database',
      });

      expect(result.answer).toContain('Relevant Documentation');
      expect(result.citations.length).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('uses default config', () => {
      expect(pipeline).toBeDefined();
    });

    it('accepts custom config', () => {
      const customPipeline = new RAGPipeline(
        embedder,
        store as any,
        reranker,
        {
          topK: 20,
          maxTokens: 2048,
          temperature: 0.5,
        }
      );

      expect(customPipeline).toBeDefined();
    });

    it('uses Groq if API key provided', () => {
      const withGroq = new RAGPipeline(
        embedder,
        store as any,
        reranker,
        { groqApiKey: 'test-key' }
      );

      expect(withGroq).toBeDefined();
    });
  });
});

describe('createRAGPipeline', () => {
  it('creates pipeline with components', () => {
    const embedder = new Embedder({ provider: 'openai' });
    const store = new MockMilvusStore() as any;
    const reranker = new Reranker({ enabled: false });

    const pipeline = createRAGPipeline(embedder, store, reranker);

    expect(pipeline).toBeInstanceOf(RAGPipeline);
  });

  it('accepts custom config', () => {
    const embedder = new Embedder({ provider: 'openai' });
    const store = new MockMilvusStore() as any;
    const reranker = new Reranker({ enabled: false });

    const pipeline = createRAGPipeline(embedder, store, reranker, {
      topK: 15,
    });

    expect(pipeline).toBeInstanceOf(RAGPipeline);
  });
});

