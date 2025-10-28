<div align="center">
  <img src="resources/logo.png" alt="Non‑Speculative logo" width="200" />
</div>

# non-speculative

[![Build](https://github.com/cryptekbits/Non-Speculative/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/cryptekbits/Non-Speculative/actions/workflows/build.yml) [![Tests](https://github.com/cryptekbits/Non-Speculative/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/cryptekbits/Non-Speculative/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@cryptek/non-speculative.svg)](https://www.npmjs.com/package/@cryptek/non-speculative)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Types](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](#)

Documentation-focused MCP server with semantic search and optional RAG answers. TypeScript ESM package, CI-ready, and publishable to npm.

## Install

```bash
npm install @cryptek/non-speculative
```

## Quickstart

```ts
import { } from '@cryptek/non-speculative';
// See `mcp-server` for CLI/server usage
```

## CLI (server)

The MCP server lives under `mcp-server`.

```bash
cd mcp-server
npm ci
npm run build
node dist/index.js --docs-path ./docs
```

## Testing

```bash
cd mcp-server
npm test           # unit tests
npm run test:unit  # unit only
npm run test:integration  # gated by secrets
```

## CI Secrets

Set repository Actions secrets:

- `GROQ_API_KEY`
- `VOYAGE_API_KEY`
- `COHERE_API_KEY`

Integration tests auto-skip if secrets are absent.

Local: copy `.env.example` to `.env` inside `mcp-server` and fill keys.

## License

MIT


