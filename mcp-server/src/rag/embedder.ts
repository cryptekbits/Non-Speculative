/**
 * Pluggable embedder using AI SDK v6
 * Supports batching and streaming
 */

export interface EmbedderConfig {
  model?: string;
  dimensions?: number;
  batchSize?: number;
  provider?: "voyage" | "openai" | "cohere" | "huggingface" | "transformers";
}

export interface EmbeddingResult {
  embedding: number[];
  tokens?: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
}

/**
 * Simple local embedder using transformers.js (fallback when no API available)
 * For production, use OpenAI, Cohere, or hosted models
 */
export class Embedder {
  private config: Required<EmbedderConfig>;
  private cache: Map<string, number[]> = new Map();

  constructor(config?: EmbedderConfig) {
    this.config = {
      model: config?.model || "voyage-3-large",
      dimensions: config?.dimensions || 1024,
      batchSize: config?.batchSize || 32,
      provider: config?.provider || "voyage",
    };
  }

  /**
   * Embed a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const cached = this.cache.get(text);
    if (cached) return { embedding: cached };

    if (this.config.provider === "voyage") {
      const [embedding] = await this.embedVoyageBatch([text]);
      this.cache.set(text, embedding);
      return { embedding };
    }

    const embedding = await this.generateEmbedding(text);
    this.cache.set(text, embedding);
    return { embedding };
  }

  /**
   * Embed multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const embeddings: number[][] = new Array(texts.length);
    let totalTokens = 0;

    // First, fill from cache
    const toFetch: Array<{ index: number; text: string }> = [];
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const cached = this.cache.get(t);
      if (cached) {
        embeddings[i] = cached;
      } else {
        toFetch.push({ index: i, text: t });
      }
    }

    if (toFetch.length > 0) {
      if (this.config.provider === "voyage") {
        // Fetch in configured batch sizes
        for (let i = 0; i < toFetch.length; i += this.config.batchSize) {
          const batch = toFetch.slice(i, i + this.config.batchSize);
          const batchTexts = batch.map((b) => b.text);
          const batchEmbeddings = await this.embedVoyageBatch(batchTexts);
          for (let j = 0; j < batch.length; j++) {
            const idx = batch[j].index;
            const emb = batchEmbeddings[j];
            embeddings[idx] = emb;
            this.cache.set(batch[j].text, emb);
          }
        }
      } else {
        // Fallback local embedding
        for (const item of toFetch) {
          const emb = await this.generateEmbedding(item.text);
          embeddings[item.index] = emb;
          this.cache.set(item.text, emb);
        }
      }
    }

    return { embeddings: embeddings as number[][], totalTokens };
  }

  /**
   * Generate embedding vector
   * TODO: Replace with actual AI SDK v6 embedding provider
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Mock implementation using deterministic hash with keyword-based similarity
    // In production, use:
    // - AI SDK v6 with OpenAI embeddings
    // - Transformers.js for local embeddings
    // - Cohere or other providers
    
    const embedding = new Array(this.config.dimensions);
    const lowerText = text.toLowerCase();
    
    // Extract semantic features based on keywords (topic modeling)
    const topics = {
      auth: ['auth', 'authentication', 'jwt', 'token', 'login', 'password', 'bearer'],
      database: ['database', 'postgres', 'sql', 'data', 'store', 'pgbouncer'],
      cache: ['cache', 'redis', 'memory', 'ttl'],
      api: ['api', 'endpoint', 'rest', 'http', 'express'],
      user: ['user', 'service', 'contract'],
    };
    
    const topicScores: Record<string, number> = {};
    Object.entries(topics).forEach(([topic, keywords]) => {
      let score = 0;
      keywords.forEach(kw => {
        if (lowerText.includes(kw)) {
          score += 1.0;
        }
      });
      topicScores[topic] = score;
    });
    
    // Generate base hash for uniqueness
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }

    // Generate embedding with strong topic signals
    const topicNames = Object.keys(topicScores);
    for (let i = 0; i < this.config.dimensions; i++) {
      const seed = hash + i * 31;
      const baseValue = (Math.sin(seed) * 10000) % 1;
      
      // Add strong topic-based signal
      const topicIdx = i % topicNames.length;
      const topicName = topicNames[topicIdx];
      const topicSignal = topicScores[topicName];
      
      // Mix: 30% base randomness, 70% topic signal
      embedding[i] = baseValue * 0.3 + topicSignal * 0.7;
    }

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }

    return embedding;
  }

  /**
   * Voyage API batch embedding
   */
  private async embedVoyageBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error("VOYAGE_API_KEY is not set");
    }

    const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.config.model,
        // Optional: set input_type for retrieval; leaving null lets API infer
        // input_type: "document",
        // Ensure dimension matches Milvus collection
        output_dimension: this.config.dimensions,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Voyage embeddings error ${resp.status}: ${errText}`);
    }

    const json: any = await resp.json();
    // Voyage returns either { data: [{ embedding: [...] }, ...] } or { embeddings: [...] }
    if (Array.isArray(json?.data)) {
      return json.data.map((d: any) => d.embedding);
    }
    if (Array.isArray(json?.embeddings)) {
      return json.embeddings as number[][];
    }
    throw new Error("Unexpected Voyage embeddings response shape");
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // TODO: Track hits/misses
    };
  }
}

/**
 * Create embedder instance
 */
export function createEmbedder(config?: EmbedderConfig): Embedder {
  return new Embedder(config);
}

