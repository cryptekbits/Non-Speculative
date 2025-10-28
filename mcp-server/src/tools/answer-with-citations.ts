import { getDocIndex } from "../utils/doc-index.js";
import { chunkSections } from "../utils/chunker.js";
import { createEmbedder } from "../rag/embedder.js";
import { createMilvusStore } from "../store/milvus.js";
import { createReranker } from "../rag/reranker.js";
import { createRAGPipeline, RAGQuery } from "../rag/pipeline.js";
import { DOCS_NOT_FOUND } from "../utils/not-found.js";

// Global instances (lazy init)
let embedder: any = null;
let milvusStore: any = null;
let reranker: any = null;
let ragPipeline: any = null;
let isInitialized = false;

async function ensureInitialized(config: any = {}) {
  if (isInitialized) return;

  try {
    embedder = createEmbedder({
      provider: "voyage",
      model: (config.embedder && config.embedder.model) || "voyage-3-large",
      dimensions: (config.embedder && config.embedder.dimensions) || 1024,
      batchSize: (config.embedder && config.embedder.batchSize) || 32,
    });
    reranker = createReranker({
      enabled: config.enableRerank || false,
      provider: "cohere",
      model: "rerank-v3.5",
      topK: 6,
    });
    
    // Try to connect to Milvus, fall back to in-memory if unavailable
    try {
      milvusStore = await createMilvusStore(config.milvus);
    } catch (error) {
      console.error("⚠️  Milvus not available, using fallback mode");
      milvusStore = null;
    }

    if (milvusStore) {
      ragPipeline = createRAGPipeline(embedder, milvusStore, reranker, config.rag);
    }

    isInitialized = true;
  } catch (error) {
    console.error("❌ Failed to initialize RAG components:", error);
  }
}

export interface AnswerWithCitationsArgs {
  query: string;
  filters?: {
    release?: string;
    service?: string;
    docTypes?: string[];
  };
  maxTokens?: number;
  k?: number;
}

export async function answerWithCitations(
  projectRoot: string,
  args: AnswerWithCitationsArgs,
  config?: any
): Promise<string> {
  await ensureInitialized(config);

  // If RAG is not available, fall back to simple search
  if (!ragPipeline) {
    return fallbackAnswer(projectRoot, args);
  }

  try {
    // First ensure docs are indexed in Milvus
    await indexDocsIfNeeded(projectRoot);

    // Execute RAG query
    const ragQuery: RAGQuery = {
      query: args.query,
      filters: args.filters,
      maxTokens: args.maxTokens,
      k: args.k,
    };

    const response = await ragPipeline.query(ragQuery);

    // Format response
    let output = `# Answer: ${args.query}\n\n`;

    if (response.insufficientEvidence) {
      // If there is no evidence at all, return sentinel
      if (!response.citations || response.citations.length === 0) {
        return DOCS_NOT_FOUND;
      }
      output += `⚠️ **Insufficient Evidence**\n\n`;
      output += `The documentation does not contain enough information to fully answer this query.\n\n`;
      if (response.missingTopics) {
        output += `**Missing Topics:** ${response.missingTopics.join(", ")}\n\n`;
      }
    }

    output += `**Grounding Score:** ${(response.groundingScore * 100).toFixed(1)}%\n\n`;
    output += "---\n\n";
    output += response.answer;
    output += "\n\n---\n\n";
    output += "## Citations\n\n";

    for (let i = 0; i < response.citations.length; i++) {
      const citation = response.citations[i];
      output += `${i + 1}. **${citation.heading}**\n`;
      output += `   File: ${citation.file}, Lines: ${citation.lineStart}-${citation.lineEnd}\n`;
      output += `   Relevance: ${(citation.relevance * 100).toFixed(1)}%\n\n`;
    }

    return output;
  } catch (error) {
    console.error("❌ RAG query failed:", error);
    return fallbackAnswer(projectRoot, args);
  }
}

/**
 * Fallback to simple search when RAG is unavailable
 */
function fallbackAnswer(
  projectRoot: string,
  args: AnswerWithCitationsArgs
): string {
  const { sections } = getDocIndex(projectRoot);

  if (sections.length === 0) {
    return DOCS_NOT_FOUND;
  }

  // Use existing semantic search
  const { semanticSearch } = require("../utils/semantic-search.js");
  const results = semanticSearch(sections, args.query, {
    release: args.filters?.release,
    service: args.filters?.service,
    docTypes: args.filters?.docTypes,
    maxResults: args.k || 5,
  });

  if (results.length === 0) {
    return DOCS_NOT_FOUND;
  }

  let output = `# Documentation Excerpts: ${args.query}\n\n`;
  output += `⚠️ RAG mode unavailable, showing search results instead.\n\n`;

  for (const result of results) {
    const { section } = result;
    output += `## ${section.heading}\n`;
    output += `**Source:** ${section.file} (${section.release})\n\n`;
    output += section.content;
    output += "\n\n---\n\n";
  }

  return output;
}

/**
 * Index docs in Milvus if not already indexed
 */
async function indexDocsIfNeeded(projectRoot: string): Promise<void> {
  if (!milvusStore || !embedder) return;

  try {
    const stats = await milvusStore.getStats();
    
    // If collection is empty, index all docs
    if (stats.count === 0) {
      console.error("📥 Indexing documentation in Milvus...");
      
      const { sections } = getDocIndex(projectRoot);
      const chunks = chunkSections(sections);
      
      // Embed chunks
      const texts = chunks.map(c => c.content);
      const { embeddings } = await embedder.embedBatch(texts);
      
      // Upsert to Milvus
      await milvusStore.upsert(chunks, embeddings);
      
      console.error(`✅ Indexed ${chunks.length} chunks`);
    }
  } catch (error) {
    console.error("⚠️  Failed to index docs:", error);
  }
}

