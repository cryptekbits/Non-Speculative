import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Embedder, createEmbedder } from '../../src/rag/embedder.js';

describe('Embedder', () => {
  let embedder: Embedder;

  beforeEach(() => {
    embedder = new Embedder({ provider: 'openai', dimensions: 128 }); // Use mock provider
  });

  describe('embed', () => {
    it('generates embedding for text', async () => {
      const result = await embedder.embed('test text');

      expect(result.embedding).toBeDefined();
      expect(result.embedding.length).toBe(128);
      expect(result.embedding.every(v => typeof v === 'number')).toBe(true);
    });

    it('generates normalized embeddings', async () => {
      const result = await embedder.embed('test text');

      // Calculate magnitude
      const magnitude = Math.sqrt(
        result.embedding.reduce((sum, val) => sum + val * val, 0)
      );

      // Should be normalized (magnitude ≈ 1)
      expect(magnitude).toBeCloseTo(1, 2);
    });

    it('generates different embeddings for different texts', async () => {
      const result1 = await embedder.embed('text one');
      const result2 = await embedder.embed('text two');

      expect(result1.embedding).not.toEqual(result2.embedding);
    });

    it('generates consistent embeddings for same text', async () => {
      const result1 = await embedder.embed('consistent text');
      const result2 = await embedder.embed('consistent text');

      expect(result1.embedding).toEqual(result2.embedding);
    });
  });

  describe('caching', () => {
    it('caches embeddings', async () => {
      const text = 'cached text';
      
      const result1 = await embedder.embed(text);
      const result2 = await embedder.embed(text);

      // Both should return same array reference (cached)
      expect(result1.embedding).toEqual(result2.embedding);
    });

    it('uses cache for repeated texts', async () => {
      const spy = vi.spyOn(embedder as any, 'generateEmbedding');

      await embedder.embed('cached');
      await embedder.embed('cached');
      await embedder.embed('cached');

      // Should only generate once
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('clears cache', async () => {
      await embedder.embed('text');
      
      embedder.clearCache();
      
      const stats = embedder.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('tracks cache size', async () => {
      await embedder.embed('text 1');
      await embedder.embed('text 2');
      await embedder.embed('text 3');

      const stats = embedder.getCacheStats();
      expect(stats.size).toBe(3);
    });
  });

  describe('embedBatch', () => {
    it('embeds multiple texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3'];
      
      const result = await embedder.embedBatch(texts);

      expect(result.embeddings.length).toBe(3);
      result.embeddings.forEach(emb => {
        expect(emb.length).toBe(128);
      });
    });

    it('handles empty batch', async () => {
      const result = await embedder.embedBatch([]);

      expect(result.embeddings.length).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('uses cache for batch processing', async () => {
      const spy = vi.spyOn(embedder as any, 'generateEmbedding');

      // Pre-cache some texts
      await embedder.embed('cached 1');
      await embedder.embed('cached 2');

      spy.mockClear();

      // Batch should use cache for cached items
      await embedder.embedBatch(['cached 1', 'new', 'cached 2']);

      // Should only generate embedding for 'new'
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('maintains order in batch results', async () => {
      const texts = ['alpha', 'beta', 'gamma'];
      
      const result = await embedder.embedBatch(texts);

      // Verify order by checking embeddings are different
      expect(result.embeddings[0]).not.toEqual(result.embeddings[1]);
      expect(result.embeddings[1]).not.toEqual(result.embeddings[2]);
      
      // Verify by embedding individually
      const alpha = await embedder.embed('alpha');
      expect(result.embeddings[0]).toEqual(alpha.embedding);
    });

    it('respects batch size configuration', async () => {
      const largeBatchEmbedder = new Embedder({ 
        provider: 'openai', 
        dimensions: 128, 
        batchSize: 2 
      });

      const texts = Array(5).fill(0).map((_, i) => `text ${i}`);
      
      const result = await largeBatchEmbedder.embedBatch(texts);

      expect(result.embeddings.length).toBe(5);
    });

    it('handles duplicate texts in batch', async () => {
      const texts = ['same', 'same', 'different'];
      
      const result = await embedder.embedBatch(texts);

      // Same texts should have same embedding
      expect(result.embeddings[0]).toEqual(result.embeddings[1]);
      expect(result.embeddings[0]).not.toEqual(result.embeddings[2]);
    });
  });

  describe('configuration', () => {
    it('respects custom dimensions', async () => {
      const custom = new Embedder({ provider: 'openai', dimensions: 512 });
      
      const result = await custom.embed('test');

      expect(result.embedding.length).toBe(512);
    });

    it('uses default dimensions', async () => {
      const defaultEmbedder = new Embedder({ provider: 'openai' });
      
      const result = await defaultEmbedder.embed('test');

      expect(result.embedding.length).toBe(1024);
    });

    it('uses default batch size', () => {
      const defaultEmbedder = new Embedder({ provider: 'openai' });
      
      expect((defaultEmbedder as any).config.batchSize).toBe(32);
    });

    it('respects custom batch size', () => {
      const custom = new Embedder({ provider: 'openai', batchSize: 64 });
      
      expect((custom as any).config.batchSize).toBe(64);
    });
  });

  describe('Voyage provider', () => {
    it('throws error if API key not set', async () => {
      const original = process.env.VOYAGE_API_KEY;
      delete process.env.VOYAGE_API_KEY;

      const voyageEmbedder = new Embedder({ provider: 'voyage' });

      await expect(voyageEmbedder.embed('test')).rejects.toThrow('VOYAGE_API_KEY');

      if (original) process.env.VOYAGE_API_KEY = original;
    });
  });
});

describe('createEmbedder', () => {
  it('creates embedder with config', () => {
    const embedder = createEmbedder({ provider: 'openai', dimensions: 256 });

    expect(embedder).toBeInstanceOf(Embedder);
    expect((embedder as any).config.dimensions).toBe(256);
  });

  it('creates embedder with defaults', () => {
    const embedder = createEmbedder();

    expect(embedder).toBeInstanceOf(Embedder);
    expect((embedder as any).config.dimensions).toBe(1024);
  });
});

