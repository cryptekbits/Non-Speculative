import { describe, it, expect } from 'vitest';
import { createReranker } from '../../src/rag/reranker.js';

const hasCohere = !!process.env.COHERE_API_KEY;

(hasCohere ? describe : describe.skip)('Cohere reranker integration', () => {
  it('creates reranker with provider and model', async () => {
    const reranker = createReranker({ enabled: true, provider: 'cohere', model: 'rerank-v3.5', topK: 2 });
    expect(reranker.isEnabled()).toBe(true);
  });
});


