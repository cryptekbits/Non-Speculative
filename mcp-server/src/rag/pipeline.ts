/**
 * Agentic RAG Pipeline
 * Powered by AI SDK v6 + Groq for generation
 */

import { createGroq } from "@ai-sdk/groq";
import { generateText, wrapLanguageModel } from "ai";
import { Embedder } from "./embedder.js";
import { MilvusStore, SearchFilter } from "../store/milvus.js";
import { Reranker } from "./reranker.js";

export interface RAGConfig {
  groqApiKey?: string;
  groqModel?: string;
  topK?: number;
  maxTokens?: number;
  temperature?: number;
  enableRerank?: boolean;
}

export interface RAGQuery {
  query: string;
  filters?: SearchFilter;
  maxTokens?: number;
  k?: number;
}

export interface Citation {
  file: string;
  heading: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  relevance: number;
}

export interface RAGResponse {
  answer: string;
  citations: Citation[];
  groundingScore: number;
  insufficientEvidence: boolean;
  missingTopics?: string[];
}

const DEFAULT_CONFIG: Required<RAGConfig> = {
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: "llama-3.3-70b-versatile",
  topK: 10,
  maxTokens: 1024,
  temperature: 0.1,
  enableRerank: false,
};

const GROUNDING_SYSTEM_PROMPT = `You are a documentation expert. Your role is to answer questions STRICTLY based on the provided documentation excerpts.

CRITICAL RULES:
1. Answer ONLY using information from the provided citations
2. Every claim must be traceable to a specific citation
3. If information is insufficient, say so explicitly
4. Be exhaustive but NOT verbose - use bullets, code refs, and clear structure
5. Include file paths and line numbers when referencing specific details
6. Do NOT make assumptions or add information not in the citations
7. If multiple versions exist, mention all relevant ones

FORMAT:
- Use bullet points for clarity
- Reference citations as [File:Line]
- Include code snippets when helpful
- Highlight version/release differences`;

export class RAGPipeline {
  private config: Required<RAGConfig>;
  private embedder: Embedder;
  private store: MilvusStore;
  private reranker: Reranker;
  private groq: any;
  private groqWrapped: any;

  constructor(
    embedder: Embedder,
    store: MilvusStore,
    reranker: Reranker,
    config?: RAGConfig
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embedder = embedder;
    this.store = store;
    this.reranker = reranker;

    if (this.config.groqApiKey) {
      this.groq = createGroq({
        apiKey: this.config.groqApiKey,
      });
      // Wrap with default settings: high reasoning effort, parsed format
      this.groqWrapped = (modelId: string) =>
        wrapLanguageModel({
          model: this.groq(modelId),
          middleware: [],
        });
    }
  }

  /**
   * Execute RAG query
   */
  async query(params: RAGQuery): Promise<RAGResponse> {
    const topK = params.k || this.config.topK;

    // 1. Normalize query
    const normalizedQuery = this.normalizeQuery(params.query);

    // 2. Embed query
    const { embedding } = await this.embedder.embed(normalizedQuery);

    // 3. Retrieve from Milvus
    const searchResults = await this.store.search(
      embedding,
      topK,
      params.filters
    );

    if (searchResults.length === 0) {
      return {
        answer: "No relevant documentation found for this query.",
        citations: [],
        groundingScore: 0,
        insufficientEvidence: true,
        missingTopics: [params.query],
      };
    }

    // 4. Optional reranking
    const reranked = await this.reranker.rerank(
      normalizedQuery,
      searchResults
    );

    // 5. Extract citations
    const citations: Citation[] = reranked.map((r, idx) => ({
      file: r.result.chunk.metadata.file,
      heading: r.result.chunk.metadata.heading,
      lineStart: r.result.chunk.metadata.lineStart,
      lineEnd: r.result.chunk.metadata.lineEnd,
      snippet: r.result.chunk.content.slice(0, 300),
      relevance: r.rerankScore,
    }));

    // 6. Build context from top citations
    const context = this.buildContext(reranked.slice(0, 5));

    // 7. Generate answer with grounding check
    const answer = await this.generateAnswer(
      normalizedQuery,
      context,
      citations,
      params.maxTokens
    );

    // 8. Assess grounding
    const { groundingScore, insufficientEvidence, missingTopics } =
      this.assessGrounding(answer, citations);

    return {
      answer,
      citations,
      groundingScore,
      insufficientEvidence,
      missingTopics,
    };
  }

  /**
   * Normalize query for better retrieval
   */
  private normalizeQuery(query: string): string {
    // Remove question marks, expand abbreviations, etc.
    return query.trim();
  }

  /**
   * Build context string from reranked results
   */
  private buildContext(reranked: any[]): string {
    let context = "";

    for (let i = 0; i < reranked.length; i++) {
      const r = reranked[i];
      const chunk = r.result.chunk;
      
      context += `[Citation ${i + 1}: ${chunk.metadata.file}, lines ${chunk.metadata.lineStart}-${chunk.metadata.lineEnd}]\n`;
      context += `Heading: ${chunk.metadata.heading}\n`;
      if (chunk.metadata.release) {
        context += `Release: ${chunk.metadata.release}\n`;
      }
      context += `Content:\n${chunk.content}\n\n`;
      context += "---\n\n";
    }

    return context;
  }

  /**
   * Generate answer using Groq
   */
  private async generateAnswer(
    query: string,
    context: string,
    citations: Citation[],
    maxTokens?: number
  ): Promise<string> {
    if (!this.groq) {
      // Fallback: return context directly
      return this.fallbackAnswer(context, citations);
    }

    try {
      const { text } = await generateText({
        model: this.groqWrapped
          ? this.groqWrapped(this.config.groqModel)
          : this.groq(this.config.groqModel),
        system: GROUNDING_SYSTEM_PROMPT,
        prompt: `Context:\n${context}\n\nQuestion: ${query}\n\nProvide a comprehensive but concise answer based ONLY on the context above.`,
        maxOutputTokens: maxTokens || this.config.maxTokens,
        temperature: this.config.temperature,
        providerOptions: {
          groq: {
            reasoning_effort: "high",
            reasoning_format: "parsed",
          },
        },
      });

      return text;
    } catch (error) {
      console.error("❌ Groq generation failed:", error);
      return this.fallbackAnswer(context, citations);
    }
  }

  /**
   * Fallback answer when generation is unavailable
   */
  private fallbackAnswer(context: string, citations: Citation[]): string {
    let answer = "## Relevant Documentation\n\n";
    
    for (const citation of citations.slice(0, 3)) {
      answer += `### ${citation.heading}\n`;
      answer += `**Source:** ${citation.file} (lines ${citation.lineStart}-${citation.lineEnd})\n\n`;
      answer += `${citation.snippet}...\n\n`;
    }

    return answer;
  }

  /**
   * Assess grounding quality
   */
  private assessGrounding(
    answer: string,
    citations: Citation[]
  ): {
    groundingScore: number;
    insufficientEvidence: boolean;
    missingTopics?: string[];
  } {
    // Simple heuristic: check if answer references citations
    let score = 0;

    // Check for citation markers
    if (answer.includes("[") || answer.includes("lines")) {
      score += 0.3;
    }

    // Check for file/heading references
    for (const citation of citations) {
      if (answer.toLowerCase().includes(citation.heading.toLowerCase())) {
        score += 0.2;
      }
    }

    // Cap at 1.0
    score = Math.min(score, 1.0);

    const insufficientEvidence = score < 0.3;

    return {
      groundingScore: score,
      insufficientEvidence,
      missingTopics: insufficientEvidence ? ["Additional context needed"] : undefined,
    };
  }
}

/**
 * Create RAG pipeline instance
 */
export function createRAGPipeline(
  embedder: Embedder,
  store: MilvusStore,
  reranker: Reranker,
  config?: RAGConfig
): RAGPipeline {
  return new RAGPipeline(embedder, store, reranker, config);
}

