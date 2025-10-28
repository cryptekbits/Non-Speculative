#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getArchitectureContext } from "./tools/architecture-context.js";
import { compareReleases } from "./tools/release-comparison.js";
import { getServiceDependencies } from "./tools/service-dependencies.js";
import { searchDocs } from "./tools/search-docs.js";
import { answerWithCitations } from "./tools/answer-with-citations.js";
import { DOCS_NOT_FOUND } from "./utils/not-found.js";
import { suggestDocUpdate, applyDocUpdate } from "./tools/doc-update-tools.js";
import { createDocsWatcher } from "./watchers/docs-watcher.js";
import { createHTTPBridge } from "./http/server.js";

// Parse command-line arguments
interface CLIArgs {
  docsPath: string;
  http: boolean;
  port: number;
  watch: boolean;
  cacheTtlMs: number;
  milvusUri?: string;
  milvusDb?: string;
  milvusCollection?: string;
  embedModel?: string;
  groqModel?: string;
  noRerank: boolean;
  maxConcurrency: number;
  refreshOnStart: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  
  const getArg = (name: string, short?: string): string | undefined => {
    // Check --name=value
    const eqArg = args.find(arg => arg.startsWith(`--${name}=`));
    if (eqArg) return eqArg.split('=')[1];
    
    // Check --name value or -short value
    const flags = [`--${name}`];
    if (short) flags.push(`-${short}`);
    
    const flagIndex = args.findIndex(arg => flags.includes(arg));
    if (flagIndex !== -1 && args[flagIndex + 1]) {
      return args[flagIndex + 1];
    }
    
    return undefined;
  };
  
  const hasFlag = (name: string): boolean => {
    return args.includes(`--${name}`);
  };

  // Docs path
  const docsPath = getArg('docs-path', 'd') || 
                   args.find(arg => !arg.startsWith('-')) ||
                   process.env.PROJECT_ROOT || 
                   process.cwd();

  return {
    docsPath,
    http: hasFlag('http'),
    port: parseInt(getArg('port') || '9000'),
    watch: !hasFlag('no-watch'),
    cacheTtlMs: parseInt(getArg('cache-ttl-ms') || '300000'),
    milvusUri: getArg('milvus-uri') || process.env.MILVUS_URI,
    milvusDb: getArg('milvus-db') || 'default',
    milvusCollection: getArg('milvus-collection') || 'doc_chunks',
    embedModel: getArg('embed-model') || 'voyage-3-large',
    groqModel: getArg('groq-model') || 'llama-3.3-70b-versatile',
    noRerank: hasFlag('no-rerank'),
    maxConcurrency: parseInt(getArg('max-concurrency') || '10'),
    refreshOnStart: hasFlag('refresh'),
  };
}

const config = parseArgs();
console.error(`📚 Documentation path: ${config.docsPath}`);
console.error(`⚙️  HTTP mode: ${config.http ? 'enabled' : 'disabled'}`);
console.error(`👀 Watch mode: ${config.watch ? 'enabled' : 'disabled'}`);

// Initialize watcher if enabled
let watcher: any = null;
if (config.watch) {
  watcher = createDocsWatcher(config.docsPath, async () => {
    console.error("🔄 Documentation changed, cache invalidated");
  });
}

// Create MCP server
const server = new Server(
  {
    name: "docs-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_docs",
        description: "Fast search across documentation. Returns ranked sections with metadata.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'authentication', 'semantic cache')",
            },
            filters: {
              type: "object",
              properties: {
                release: {
                  type: "string",
                  enum: ["R1", "R2", "R3", "R4"],
                },
                service: { type: "string" },
                docTypes: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
          required: ["query"],
        },
      },
      {
        name: "answer_with_citations",
        description: "Get an AI-generated answer grounded in documentation with citations. Uses RAG pipeline for comprehensive, well-cited responses.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Question to answer based on documentation",
            },
            filters: {
              type: "object",
              properties: {
                release: { type: "string", enum: ["R1", "R2", "R3", "R4"] },
                service: { type: "string" },
                docTypes: { type: "array", items: { type: "string" } },
              },
            },
            maxTokens: { type: "number", description: "Max tokens in response" },
            k: { type: "number", description: "Number of docs to retrieve" },
          },
          required: ["query"],
        },
      },
      {
        name: "suggest_doc_update",
        description: "Propose a documentation update. AI decides whether to update existing doc or create new one.",
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description: "What to document (e.g., 'Add Redis configuration details')",
            },
            context: {
              type: "string",
              description: "Additional context or content to add",
            },
            targetFile: { type: "string", description: "Optional target file" },
            targetRelease: { type: "string", enum: ["R1", "R2", "R3", "R4"] },
          },
          required: ["intent"],
        },
      },
      {
        name: "apply_doc_update",
        description: "Apply a proposed documentation update. Writes to file and triggers reindex.",
        inputSchema: {
          type: "object",
          properties: {
            targetPath: { type: "string", description: "Path to update" },
            diff: { type: "string", description: "Content to add/update" },
            force: { type: "boolean", description: "Override conflict blocking" },
          },
          required: ["targetPath", "diff"],
        },
      },
      {
        name: "get_architecture_context",
        description: "Search architecture documentation for relevant context (legacy tool, consider using search_docs or answer_with_citations).",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            release: { type: "string", enum: ["R1", "R2", "R3", "R4"] },
            service: { type: "string" },
            doc_types: { type: "array", items: { type: "string" } },
          },
          required: ["query"],
        },
      },
      {
        name: "compare_releases",
        description: "Compare how a feature evolved across releases.",
        inputSchema: {
          type: "object",
          properties: {
            feature: { type: "string" },
            releases: {
              type: "array",
              items: { type: "string", enum: ["R1", "R2", "R3", "R4"] },
            },
          },
          required: ["feature"],
        },
      },
      {
        name: "get_service_dependencies",
        description: "Map dependencies and relationships for a service.",
        inputSchema: {
          type: "object",
          properties: {
            service: { type: "string" },
            release: { type: "string", enum: ["R1", "R2", "R3", "R4"] },
            include_data_flow: { type: "boolean", default: false },
          },
          required: ["service", "release"],
        },
      },
    ],
  };
});

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!args) {
      throw new Error("Missing arguments");
    }

    switch (name) {
      case "search_docs": {
        const result = await searchDocs(config.docsPath, args as any);
        if (result === DOCS_NOT_FOUND) {
          return { content: [{ type: "text", text: "No documentation found for this query. Try broadening your terms or removing filters." }] };
        }
        return { content: [{ type: "text", text: result }] };
      }

      case "answer_with_citations": {
        const result = await answerWithCitations(
          config.docsPath,
          args as any,
          {
            milvus: {
              uri: config.milvusUri,
              database: config.milvusDb,
              collection: config.milvusCollection,
            },
            embedder: { model: config.embedModel },
            rag: { groqModel: config.groqModel },
            enableRerank: !config.noRerank,
          }
        );
        if (result === DOCS_NOT_FOUND) {
          return { content: [{ type: "text", text: "No relevant documentation was found to answer this question." }] };
        }
        return { content: [{ type: "text", text: result }] };
      }

      case "suggest_doc_update": {
        const result = await suggestDocUpdate(
          config.docsPath,
          args.intent as string,
          args.context as string | undefined,
          args.targetFile as string | undefined,
          args.targetRelease as string | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "apply_doc_update": {
        const result = await applyDocUpdate(
          config.docsPath,
          args.targetPath as string,
          args.diff as string,
          args.force as boolean
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "get_architecture_context": {
        const result = await getArchitectureContext(
          config.docsPath,
          args.query as string,
          args.release as string | undefined,
          args.service as string | undefined,
          args.doc_types as string[] | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "compare_releases": {
        const result = await compareReleases(
          config.docsPath,
          args.feature as string,
          args.releases as string[] | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      case "get_service_dependencies": {
        const result = await getServiceDependencies(
          config.docsPath,
          args.service as string,
          args.release as string,
          args.include_data_flow as boolean | undefined
        );
        return { content: [{ type: "text", text: result }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  if (config.http) {
    // HTTP mode
    const httpBridge = await createHTTPBridge({ port: config.port });
    // Health endpoints exist out of the box
    // Add refresh endpoint via tool for full reindex on demand

    // Register all tools
    httpBridge.registerTool({
      name: "search_docs",
      description: "Search documentation",
      inputSchema: {},
      handler: async (args) => {
        const result = await searchDocs(config.docsPath, args);
        if (result === DOCS_NOT_FOUND) {
          return "No documentation found for this query. Try broadening your terms or removing filters.";
        }
        return result;
      },
    });

    httpBridge.registerTool({
      name: "answer_with_citations",
      description: "Get cited answer",
      inputSchema: {},
      handler: async (args) => {
        const result = await answerWithCitations(config.docsPath, args, {
          milvus: { uri: config.milvusUri },
          embedder: { model: config.embedModel },
          rag: { groqModel: config.groqModel },
        });
        if (result === DOCS_NOT_FOUND) {
          return "No relevant documentation was found to answer this question.";
        }
        return result;
      },
    });

    httpBridge.registerTool({
      name: "refresh",
      description: "Invalidate doc index cache for the current docs path",
      inputSchema: {},
      handler: async () => {
        const { invalidateDocIndex } = await import("./utils/doc-index.js");
        invalidateDocIndex(config.docsPath);
        return "OK";
      },
    });

    httpBridge.registerTool({
      name: "suggest_doc_update",
      description: "Suggest doc update",
      inputSchema: {},
      handler: async (args) =>
        suggestDocUpdate(
          config.docsPath,
          args.intent,
          args.context,
          args.targetFile,
          args.targetRelease
        ),
    });

    httpBridge.registerTool({
      name: "apply_doc_update",
      description: "Apply doc update",
      inputSchema: {},
      handler: async (args) =>
        applyDocUpdate(config.docsPath, args.targetPath, args.diff, args.force),
    });

    httpBridge.registerTool({
      name: "get_architecture_context",
      description: "Get architecture context",
      inputSchema: {},
      handler: async (args) =>
        getArchitectureContext(
          config.docsPath,
          args.query,
          args.release,
          args.service,
          args.doc_types
        ),
    });

    httpBridge.registerTool({
      name: "compare_releases",
      description: "Compare releases",
      inputSchema: {},
      handler: async (args) =>
        compareReleases(config.docsPath, args.feature, args.releases),
    });

    httpBridge.registerTool({
      name: "get_service_dependencies",
      description: "Get service dependencies",
      inputSchema: {},
      handler: async (args) =>
        getServiceDependencies(
          config.docsPath,
          args.service,
          args.release,
          args.include_data_flow
        ),
    });

    console.error("✅ HTTP mode started successfully");
  } else {
    // STDIO mode (default MCP)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
