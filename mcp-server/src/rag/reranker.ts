/**
 * Cross-encoder reranker for improving retrieval quality
 * Optional component - can be disabled via flag
 */

import { SearchResult } from "../store/milvus.js";

export interface RerankerConfig {
  model?: string;
  topK?: number;
  enabled?: boolean;
  provider?: "cohere" | "mock";
}

export interface RerankedResult {
  result: SearchResult;
  rerankScore: number;
}

const DEFAULT_CONFIG: Required<RerankerConfig> = {
  model: "rerank-v3.5",
  topK: 6,
  enabled: false,
  provider: "cohere",
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

    try {
      if (this.config.provider === "cohere") {
        const cohereKey = process.env.COHERE_API_KEY;
        if (!cohereKey) {
          throw new Error("COHERE_API_KEY is not set");
        }

        const topN = Math.min(this.config.topK, results.length);
        const documents = results.map((r) => r.chunk.content);

        const resp = await fetch("https://api.cohere.ai/v2/rerank", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cohereKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            query,
            top_n: topN,
            documents,
            max_tokens_per_doc: 4096,
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(`Cohere rerank error ${resp.status}: ${errText}`);
        }

        const json: any = await resp.json();
        // Expected json.results: [{ index: number, relevance_score: number }, ...]
        const cohereResults: Array<{ index: number; relevance_score: number }> =
          (json?.results as any[])?.map((r: any) => ({
            index: typeof r.index === "number" ? r.index : r?.document?.index,
            relevance_score: r.relevance_score ?? r?.relevanceScore ?? 0,
          })) || [];

        const mapped: RerankedResult[] = cohereResults.map((cr) => ({
          result: results[cr.index],
          rerankScore: cr.relevance_score,
        }));

        // If Cohere returns less than requested, backfill remaining in original order
        if (mapped.length < topN) {
          const used = new Set(mapped.map((m) => m.result));
          for (const r of results) {
            if (mapped.length >= topN) break;
            if (!used.has(r)) {
              mapped.push({ result: r, rerankScore: r.score });
            }
          }
        }

        return mapped;
      }
    } catch (err) {
      // Fallback to heuristic reranker on error
      console.error("⚠️ Cohere rerank failed, using fallback:", err);
    }

    const scored = results.map((result) => ({
      result,
      rerankScore: this.scoreRelevance(query, result.chunk.content),
    }));
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

