<div align="center">
  <img src="https://raw.githubusercontent.com/cryptekbits/Non-Speculative/main/resources/logo.png" alt="Non‑Speculative logo" width="200" />
</div>

# non-speculative

[![Build](https://github.com/cryptekbits/Non-Speculative/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/cryptekbits/Non-Speculative/actions/workflows/build.yml) [![Tests](https://github.com/cryptekbits/Non-Speculative/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/cryptekbits/Non-Speculative/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@cryptek/non-speculative.svg)](https://www.npmjs.com/package/@cryptek/non-speculative)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Types](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)

Documentation-focused MCP server with semantic search and optional RAG answers.
Run as an MCP STDIO server or an optional HTTP server. CLI-first, npm-ready.

## Install

```bash
npm i -g @cryptek/non-speculative
# or
npx @cryptek/non-speculative --help
```

## Quickstart

### STDIO (MCP mode)

```bash
npx @cryptek/non-speculative --docs-path ./docs
# Use with Claude Code, Cline, or any MCP client
```

### HTTP mode

```bash
npx @cryptek/non-speculative --http --port 9000 --docs-path ./docs

# Test HTTP
curl http://localhost:9000/tools
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

## Troubleshooting

- Milvus not available: falls back to lexical/semantic search; RAG features degrade gracefully.
- File watcher not triggering: on WSL/Docker, use `--no-watch` and restart after changes.
- Groq API key missing: RAG answers fall back to search-only results.

## Compatibility

- Node.js >= 18

## License

MIT
