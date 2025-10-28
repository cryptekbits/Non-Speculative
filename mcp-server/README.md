# MCP Documentation Server

[![CI](https://github.com/ORG/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/ORG/REPO/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/non-speculative.svg)](https://www.npmjs.com/package/non-speculative)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)
[![Types](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)

**Version 2.0** - Documentation-focused MCP server with Agentic RAG, auto-indexing, and multi-agent support.

## Overview

A high-performance Model Context Protocol (MCP) server designed to eliminate documentation overload for coding agents. Features:

- 🔍 **Fast semantic search** across markdown documentation
- 🤖 **Agentic RAG pipeline** with Groq + Milvus for grounded, cited answers
- 👀 **Auto-indexing** with file watchers - manual doc updates trigger instant reindex
- 🌐 **Multi-agent ready** - STDIO (MCP-native) + optional HTTP/WebSocket bridge
- 📦 **Zero-config caching** for sub-10ms repeated queries
- 🔄 **Event-based doc updates** - agents can request documentation changes

## Quick Start

### Installation

```bash
cd mcp-server
npm install
npm run build
```

### Basic Usage (STDIO - MCP Mode)

```bash
# Use with Claude Code, Cline, or any MCP client
node build/index.js --docs-path /path/to/your/docs
```

### HTTP Mode (for non-MCP agents)

```bash
# Start HTTP server on port 9000
node build/index.js --http --port 9000 --docs-path /path/to/docs
```

```bash
# Test with curl
curl http://localhost:9000/tools

curl -X POST http://localhost:9000/tools/call \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "search_docs",
    "arguments": {"query": "authentication flow"}
  }'
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--docs-path <path>` | Path to documentation directory | `$PROJECT_ROOT` or `cwd` |
| `--http` | Enable HTTP server mode | `false` (STDIO) |
| `--port <number>` | HTTP server port | `9000` |
| `--no-watch` | Disable file watching | Enabled by default |
| `--cache-ttl-ms <ms>` | Doc index cache TTL | `300000` (5 min) |
| `--milvus-uri <uri>` | Milvus server URI | `http://localhost:19530` |
| `--milvus-db <name>` | Milvus database name | `default` |
| `--milvus-collection <name>` | Collection name | `doc_chunks` |
| `--embed-model <model>` | Embedding model | `nomic-embed-text` |
| `--groq-model <model>` | Groq LLM model | `llama-3.3-70b-versatile` |
| `--no-rerank` | Disable reranking | Enabled by default |
| `--max-concurrency <n>` | Max concurrent operations | `10` |

## Environment Variables

```bash
export GROQ_API_KEY="your-groq-api-key"        # Required for RAG answers
export MILVUS_URI="http://localhost:19530"     # Optional
export MILVUS_TOKEN="your-token"               # If using Milvus Cloud
export PROJECT_ROOT="/path/to/docs"            # Fallback docs path
```

## Available Tools

### Core Tools (New)

#### `search_docs`

Fast semantic search across documentation.

```json
{
  "query": "How does authentication work?",
  "filters": {
    "release": "R2",
    "service": "iam",
    "docTypes": ["ARCHITECTURE", "SERVICE_CONTRACTS"]
  }
}
```

**Returns:** Ranked sections with file paths, line numbers, scores, and snippets.

#### `answer_with_citations`

Get AI-generated answers grounded in documentation with citations.

```json
{
  "query": "Explain the semantic cache implementation",
  "filters": { "release": "R3" },
  "maxTokens": 1024,
  "k": 10
}
```

**Returns:** 
- Comprehensive answer with inline citations
- Grounding score (confidence)
- List of source citations with relevance scores
- Warning if evidence is insufficient

#### `suggest_doc_update`

Propose a documentation update. AI decides: update existing or create new.

```json
{
  "intent": "Document Redis connection pooling configuration",
  "context": "Add details about min/max connections and timeout settings",
  "targetRelease": "R4"
}
```

**Returns:** Proposed diff + target file path + rationale.

#### `apply_doc_update`

Apply a proposed update (writes to file and triggers reindex).

```json
{
  "targetPath": "/path/to/R4-CONFIGURATION.md",
  "diff": "## Redis Pooling\n\n..."
}
```

**Returns:** Status + confirmation of reindex.

### Legacy Tools (Maintained)

- `get_architecture_context` - Original search tool
- `compare_releases` - Compare feature evolution across releases
- `get_service_dependencies` - Map service relationships

## Multi-Agent Scenarios

### Scenario 1: Multiple Agents, Same Docs (STDIO)

Each agent gets its own ephemeral process:

```bash
# Agent A (Cline instance 1)
node build/index.js --docs-path /shared/docs

# Agent B (Claude Code instance 2)
node build/index.js --docs-path /shared/docs
```

Cache is per-process, but file watcher keeps them in sync.

### Scenario 2: Multiple Agents, Different Docs (HTTP)

Run separate HTTP instances:

```bash
# Agent A
node build/index.js --http --port 9101 --docs-path /agentA/docs

# Agent B
node build/index.js --http --port 9102 --docs-path /agentB/docs
```

Each agent calls its dedicated instance via HTTP.

### Scenario 3: Mixed STDIO + HTTP

```bash
# Claude Code (STDIO)
node build/index.js --docs-path /docs

# Custom Python agent (HTTP)
node build/index.js --http --port 9000 --docs-path /docs
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  MCP Server (STDIO) or HTTP Bridge                  │
├─────────────────────────────────────────────────────┤
│  Tools Layer                                        │
│  ├─ search_docs          ├─ suggest_doc_update     │
│  ├─ answer_with_citations├─ apply_doc_update       │
│  └─ compare_releases     └─ get_service_deps       │
├─────────────────────────────────────────────────────┤
│  RAG Pipeline (Groq + Milvus)                       │
│  ├─ Query Normalization                            │
│  ├─ Embedding (nomic-embed-text)                   │
│  ├─ Milvus Vector Search (HNSW)                    │
│  ├─ Optional Reranking                             │
│  └─ Grounded Generation (Groq)                     │
├─────────────────────────────────────────────────────┤
│  Caching & Indexing                                │
│  ├─ Doc Index (in-memory, fingerprinted)          │
│  ├─ Query Cache (LRU + TTL)                        │
│  └─ Chunk Cache                                    │
├─────────────────────────────────────────────────────┤
│  File Watcher (Chokidar)                           │
│  └─ Auto-reindex on .md changes                    │
└─────────────────────────────────────────────────────┘
```

## Performance

- **Cold start:** ~100-500ms (doc parsing)
- **Warm queries:** <10ms (cached)
- **RAG queries:** 500-2000ms (depends on Groq API)
- **Reindex trigger:** Debounced 1s after file change

## HTTP API Reference

### `GET /healthz`

Health check.

```json
{
  "status": "healthy",
  "tools": 7,
  "uptime": 12345.67
}
```

### `GET /metrics`

Server metrics.

```json
{
  "requests": 1234,
  "errors": 5,
  "avgLatency": "45.23",
  "toolCalls": {
    "search_docs": 800,
    "answer_with_citations": 400
  }
}
```

### `GET /tools`

List available tools (MCP-compatible).

### `POST /tools/call`

Execute a tool.

```json
{
  "name": "search_docs",
  "arguments": {
    "query": "authentication"
  }
}
```

**Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "# Search Results: authentication\n\n..."
    }
  ]
}
```

### WebSocket `/`

Same as HTTP but with streaming support (for long RAG responses).

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Testing

```bash
# Test STDIO mode
echo '{"query": "test"}' | node build/index.js --docs-path ./test-docs

# Test HTTP mode
node build/index.js --http --port 9000 --docs-path ./test-docs &
curl http://localhost:9000/healthz
```

## Roadmap

- [ ] Graph-based doc retrieval (path-aware reasoning)
- [ ] Schema-enforced frontmatter (structured metadata)
- [ ] Query LRU cache with singleflight deduplication
- [ ] Production embedding providers (OpenAI, Cohere)
- [ ] Actual cross-encoder reranker integration

## Troubleshooting

### Milvus not available

Server falls back to lexical search if Milvus is unreachable. RAG features will use simple semantic search instead.

### File watcher not triggering

On some systems (WSL, Docker), file watching may be unreliable. Use `--no-watch` and restart server after doc changes.

### Groq API key missing

RAG answers will fall back to simple search results if `GROQ_API_KEY` is not set.

## License

MIT

## Support

For issues, questions, or feature requests, please open an issue in this repository.
