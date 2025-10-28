import { describe, it, expect } from 'vitest';
import { createRAGPipeline } from '../../src/rag/pipeline.js';
import { createEmbedder } from '../../src/rag/embedder.js';

const hasGroq = !!process.env.GROQ_API_KEY;

(hasGroq ? describe : describe.skip)('Groq integration', () => {
  it('initializes pipeline with Groq key', async () => {
    const embedder = createEmbedder({ provider: 'voyage', model: 'voyage-3-large' });
    // Minimal mock store and reranker to avoid Milvus in CI
    const store: any = { search: async () => [] };
    const reranker: any = { rerank: async (_q: string, results: any[]) => results.map((r) => ({ result: r, rerankScore: r.score || 0 })) };

    const pipeline = createRAGPipeline(embedder as any, store as any, reranker as any, {
      groqApiKey: process.env.GROQ_API_KEY,
      groqModel: 'llama-3.3-70b-versatile',
    });

    expect(pipeline).toBeTruthy();
  });
});


