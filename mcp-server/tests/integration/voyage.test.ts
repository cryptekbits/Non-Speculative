import { describe, it, expect } from 'vitest';
import { createEmbedder } from '../../src/rag/embedder.js';

const hasVoyage = !!process.env.VOYAGE_API_KEY;

(hasVoyage ? describe : describe.skip)('Voyage embeddings integration', () => {
  it('embeds a small batch', async () => {
    const embedder = createEmbedder({ provider: 'voyage', model: 'voyage-3-large', dimensions: 1024, batchSize: 2 });
    const { embeddings } = await embedder.embedBatch(['hello', 'world']);
    expect(embeddings.length).toBe(2);
    expect(embeddings[0].length).toBe(1024);
  });
});


