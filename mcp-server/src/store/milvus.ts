import { MilvusClient, DataType, MetricType } from "@zilliz/milvus2-sdk-node";
import { Chunk } from "../utils/chunker.js";

export interface MilvusConfig {
  uri?: string;
  token?: string;
  username?: string;
  password?: string;
  database?: string;
  collection?: string;
  dimensions?: number;
}

export interface SearchFilter {
  release?: string;
  docType?: string;
  service?: string;
  file?: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  distance: number;
}

const DEFAULT_CONFIG: Required<MilvusConfig> = {
  uri: "http://localhost:19530",
  token: "",
  username: "",
  password: "",
  database: "default",
  collection: "doc_chunks",
  dimensions: 1024,
};

export class MilvusStore {
  private client: MilvusClient;
  private config: Required<MilvusConfig>;
  private isConnected: boolean = false;

  constructor(config?: MilvusConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize client
    this.client = new MilvusClient({
      address: this.config.uri,
      token: this.config.token || undefined,
      username: this.config.username || undefined,
      password: this.config.password || undefined,
      database: this.config.database,
    });
  }

  /**
   * Initialize connection and create collection if needed
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      // Check if collection exists
      const hasCollection = await this.client.hasCollection({
        collection_name: this.config.collection,
      });

      if (!hasCollection.value) {
        await this.createCollection();
      }

      this.isConnected = true;
      console.error(`✅ Connected to Milvus: ${this.config.uri}`);
    } catch (error) {
      console.error("❌ Failed to connect to Milvus:", error);
      throw error;
    }
  }

  /**
   * Create collection with schema
   */
  private async createCollection(): Promise<void> {
    await this.client.createCollection({
      collection_name: this.config.collection,
      fields: [
        {
          name: "id",
          data_type: DataType.VarChar,
          is_primary_key: true,
          max_length: 512,
        },
        {
          name: "embedding",
          data_type: DataType.FloatVector,
          dim: this.config.dimensions,
        },
        {
          name: "content",
          data_type: DataType.VarChar,
          max_length: 65535,
        },
        {
          name: "file",
          data_type: DataType.VarChar,
          max_length: 512,
        },
        {
          name: "release",
          data_type: DataType.VarChar,
          max_length: 16,
        },
        {
          name: "docType",
          data_type: DataType.VarChar,
          max_length: 128,
        },
        {
          name: "service",
          data_type: DataType.VarChar,
          max_length: 128,
        },
        {
          name: "heading",
          data_type: DataType.VarChar,
          max_length: 512,
        },
        {
          name: "lineStart",
          data_type: DataType.Int32,
        },
        {
          name: "lineEnd",
          data_type: DataType.Int32,
        },
        {
          name: "chunkIndex",
          data_type: DataType.Int32,
        },
        {
          name: "tokens",
          data_type: DataType.Int32,
        },
      ],
      enableDynamicField: true,
    });

    // Create HNSW index for fast similarity search
    await this.client.createIndex({
      collection_name: this.config.collection,
      field_name: "embedding",
      index_type: "HNSW",
      metric_type: MetricType.COSINE,
      params: {
        M: 16,
        efConstruction: 256,
      },
    });

    // Load collection into memory
    await this.client.loadCollection({
      collection_name: this.config.collection,
    });

    console.error(`✅ Created collection: ${this.config.collection}`);
  }

  /**
   * Upsert chunks into Milvus
   */
  async upsert(chunks: Chunk[], embeddings: number[][]): Promise<void> {
    if (!this.isConnected) {
      throw new Error("Not connected to Milvus");
    }

    if (chunks.length !== embeddings.length) {
      throw new Error("Chunks and embeddings length mismatch");
    }

    const data = chunks.map((chunk, i) => ({
      id: chunk.id,
      embedding: embeddings[i],
      content: chunk.content.slice(0, 65535), // Truncate if too long
      file: chunk.metadata.file,
      release: chunk.metadata.release,
      docType: chunk.metadata.docType,
      service: chunk.metadata.service || "",
      heading: chunk.metadata.heading,
      lineStart: chunk.metadata.lineStart,
      lineEnd: chunk.metadata.lineEnd,
      chunkIndex: chunk.metadata.chunkIndex,
      tokens: chunk.tokens,
    }));

    await this.client.upsert({
      collection_name: this.config.collection,
      data,
    });
  }

  /**
   * Search for similar chunks
   */
  async search(
    embedding: number[],
    topK: number = 5,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.isConnected) {
      throw new Error("Not connected to Milvus");
    }

    // Build filter expression
    let expr = "";
    const conditions: string[] = [];

    if (filter?.release) {
      conditions.push(`release == "${filter.release}"`);
    }
    if (filter?.docType) {
      conditions.push(`docType == "${filter.docType}"`);
    }
    if (filter?.service) {
      conditions.push(`service == "${filter.service}"`);
    }
    if (filter?.file) {
      conditions.push(`file == "${filter.file}"`);
    }

    if (conditions.length > 0) {
      expr = conditions.join(" && ");
    }

    const searchParams: any = {
      collection_name: this.config.collection,
      vector: embedding,
      limit: topK,
      output_fields: [
        "id",
        "content",
        "file",
        "release",
        "docType",
        "service",
        "heading",
        "lineStart",
        "lineEnd",
        "chunkIndex",
        "tokens",
      ],
      params: {
        ef: Math.max(topK * 2, 64),
      },
      ...(expr ? { expr } : {}),
    };

    const results = await this.client.search(searchParams);

    // Transform results
    return results.results.map((r: any) => ({
      chunk: {
        id: r.id,
        content: r.content,
        metadata: {
          file: r.file,
          release: r.release,
          docType: r.docType,
          service: r.service || undefined,
          heading: r.heading,
          lineStart: r.lineStart,
          lineEnd: r.lineEnd,
          chunkIndex: r.chunkIndex,
          totalChunks: 0, // Not stored
        },
        tokens: r.tokens,
      },
      score: r.score,
      distance: r.distance || 0,
    }));
  }

  /**
   * Delete chunks by filter
   */
  async delete(filter: SearchFilter): Promise<number> {
    if (!this.isConnected) {
      throw new Error("Not connected to Milvus");
    }

    const conditions: string[] = [];

    if (filter.file) {
      conditions.push(`file == "${filter.file}"`);
    }
    if (filter.release) {
      conditions.push(`release == "${filter.release}"`);
    }
    if (filter.docType) {
      conditions.push(`docType == "${filter.docType}"`);
    }

    if (conditions.length === 0) {
      throw new Error("At least one filter condition required for delete");
    }

    const expr = conditions.join(" && ");

    const result: any = await this.client.deleteEntities({
      collection_name: this.config.collection,
      filter: expr,
    });

    return Number(result.delete_cnt || 0);
  }

  /**
   * Get collection stats
   */
  async getStats(): Promise<{ count: number }> {
    if (!this.isConnected) {
      throw new Error("Not connected to Milvus");
    }

    const stats: any = await this.client.getCollectionStatistics({
      collection_name: this.config.collection,
    });

    return {
      count: parseInt(String(stats.data?.row_count || "0")),
    };
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.isConnected) {
      // Milvus SDK doesn't expose explicit close
      this.isConnected = false;
    }
  }
}

/**
 * Create and connect to Milvus store
 */
export async function createMilvusStore(
  config?: MilvusConfig
): Promise<MilvusStore> {
  const store = new MilvusStore(config);
  await store.connect();
  return store;
}

