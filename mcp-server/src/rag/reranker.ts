/**
 * Cross-encoder reranker for improving retrieval quality
 * Optional component - can be disabled via flag
 */

import { SearchResult } from "../store/milvus.js";

export interface RerankerConfig {
  model?: string;
  topK?: number;
  enabled?: boolean;
}

export interface RerankedResult {
  result: SearchResult;
  rerankScore: number;
}

const DEFAULT_CONFIG: Required<RerankerConfig> = {
  model: "bge-reranker-base",
  topK: 5,
  enabled: false,
};

export class Reranker {
  private config: Required<RerankerConfig>;

  constructor(config?: RerankerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Rerank search results based on query
   */
  async rerank(
    query: string,
    results: SearchResult[]
  ): Promise<RerankedResult[]> {
    if (!this.config.enabled || results.length === 0) {
      return results.map((r) => ({ result: r, rerankScore: r.score }));
    }

    // Mock implementation - in production, use cross-encoder model
    const scored = results.map((result) => ({
      result,
      rerankScore: this.scoreRelevance(query, result.chunk.content),
    }));

    // Sort by rerank score
    scored.sort((a, b) => b.rerankScore - a.rerankScore);

    return scored.slice(0, this.config.topK);
  }

  /**
   * Score relevance using simple heuristics
   * TODO: Replace with actual cross-encoder model
   */
  private scoreRelevance(query: string, content: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    let score = 0;

    // Exact phrase match
    if (contentLower.includes(queryLower)) {
      score += 10;
    }

    // Term overlap
    const queryTerms = queryLower.split(/\s+/);
    const contentTerms = new Set(contentLower.split(/\s+/));

    for (const term of queryTerms) {
      if (contentTerms.has(term)) {
        score += 1;
      }
    }

    // Normalize by content length (prefer concise but relevant)
    const lengthPenalty = Math.log(content.length + 1) / 10;
    score = score / lengthPenalty;

    return score;
  }

  /**
   * Check if reranking is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create reranker instance
 */
export function createReranker(config?: RerankerConfig): Reranker {
  return new Reranker(config);
}

