<!-- f74249f6-a44d-4f05-b39a-3d727bdf5f5f 6b9d0386-0012-48f8-b4e8-3eefee7f41c7 -->
# Test Coverage Gap Analysis

## Current Test Coverage

### Unit Tests (2 files)

- `doc-index.test.ts` - Tests doc indexing and cache invalidation
- `semantic-search.test.ts` - Tests basic search and filtering

### Integration Tests (3 files)

- `cohere.test.ts` - Tests Cohere reranker initialization
- `groq.test.ts` - Tests Groq RAG pipeline initialization
- `voyage.test.ts` - Tests Voyage embeddings API

## Missing Test Coverage

### 1. Core Utilities (High Priority)

#### `doc-parser.ts` - NO TESTS

Missing functionality tests:

- `parseDocumentation()` - Document discovery and parsing
- `findDocFiles()` - File scanning with .docignore support
- `parseDocFile()` - Markdown parsing and section extraction
- Legacy path handling (`mnt/project`)
- Release/docType filename pattern matching (`R\d+-*.md`)
- Edge cases: empty files, malformed markdown, missing headings

#### `chunker.ts` - NO TESTS

Missing functionality tests:

- `chunkSection()` - Section chunking logic
- `chunkSections()` - Batch chunking
- Token estimation accuracy
- Overlap handling between chunks
- Markdown structure preservation (headings, code fences)
- Edge cases: very large sections, tiny sections, code-heavy content

#### `cached-search.ts` - NO TESTS

Missing functionality tests:

- `cachedSemanticSearch()` - Sync cached search
- `cachedSemanticSearchAsync()` - Async cached search with LRU
- Cache hit/miss behavior
- Fingerprint-based invalidation

#### `search-cache.ts` - NO TESTS

Missing functionality tests:

- LRU cache behavior
- TTL expiration
- Singleflight deduplication (concurrent identical requests)
- Cache statistics tracking
- Fingerprint invalidation
- Key serialization with different filter combinations

### 2. Storage Layer (Critical Priority)

#### `milvus.ts` - NO TESTS

Missing functionality tests:

- Collection creation with proper schema
- Connection handling
- `upsert()` - Batch insertion
- `search()` - Vector similarity search with filters
- `delete()` - Filtered deletion
- Filter expression building (release, docType, service, file)
- Error handling for connection failures
- Stats retrieval

### 3. RAG Components (High Priority)

#### `embedder.ts` - PARTIAL TESTS

Existing: Voyage API integration test
Missing:

- Cache hit/miss behavior
- Batch processing with configurable batch sizes
- Fallback mock embedding generation
- Error handling for API failures
- Different provider configurations
- Token counting accuracy

#### `reranker.ts` - PARTIAL TESTS

Existing: Cohere initialization test
Missing:

- Actual reranking logic with Cohere API
- Fallback heuristic reranker
- Top-K selection
- Backfilling when Cohere returns fewer results
- Error recovery
- Disabled reranker behavior

#### `pipeline.ts` - PARTIAL TESTS

Existing: Pipeline initialization test
Missing:

- End-to-end RAG query flow
- Context building from reranked results
- Answer generation with Groq
- Fallback answer when generation fails
- Grounding score assessment
- Insufficient evidence detection
- Citation extraction
- Query normalization

### 4. Analysis/Facts System (No Tests)

#### `fact-extractor.ts` - NO TESTS

Missing functionality tests:

- `extractFactsFromMarkdown()` - Pattern matching for facts
- `extractFactsFromDiff()` - Diff parsing
- Line number offset tracking
- Different fact patterns (`:`, `-`, `=`)
- Edge cases: malformed patterns, tables, bullet lists

#### `fact-index.ts` - NO TESTS

Missing functionality tests:

- `buildFactIndex()` - Index construction
- `insertFact()` - Fact insertion
- `findDuplicates()` - Duplicate detection
- `findConflicts()` - Conflict detection
- Fact key computation and canonicalization

#### `facts.ts` - NO TESTS

Missing functionality tests:

- `normalizeText()` - Text normalization
- `canonicalizeValue()` - Value canonicalization (numbers, booleans)
- `computeFactKey()` - Key generation
- `createFact()` - Fact creation with hashing

#### `fact-index-cache.ts` - NO TESTS

Missing functionality tests:

- Cache behavior
- Invalidation

### 5. Watchers (No Tests)

#### `docs-watcher.ts` - NO TESTS

Missing functionality tests:

- File change detection (add, change, unlink)
- Debouncing behavior
- Cache invalidation on changes
- Callback execution (onReindex)
- Event emission
- Start/stop lifecycle
- Error handling

### 6. Document Update System (No Tests)

#### `doc-update.ts` - NO TESTS

Missing functionality tests:

- `suggestUpdate()` - Update vs create decision
- Target file inference from intent
- Diff generation for updates
- New document content generation
- `applyUpdate()` - File writing
- Duplicate detection in proposed changes
- Conflict detection and blocking
- Force flag behavior
- Cache invalidation after updates
- Event emission

### 7. Tools/MCP Interface (No Tests)

#### Tool Functions - NO TESTS

Missing functionality tests:

- `search-docs.ts` - Search tool integration
- `answer-with-citations.ts` - RAG tool integration
- `architecture-context.ts` - Legacy search tool
- `release-comparison.ts` - Cross-release comparison
- `service-dependencies.ts` - Dependency mapping
- `doc-update-tools.ts` - Update suggestion and application tools

### 8. HTTP Server (No Tests)

#### `http/server.ts` - NO TESTS

Missing functionality tests:

- HTTP bridge creation
- Tool registration
- Request handling
- Health endpoints
- Error responses

### 9. Integration Gaps

#### End-to-End Workflows - NO TESTS

Missing integration tests:

- Complete search flow (index → search → results)
- Complete RAG flow (index → embed → search → rerank → generate)
- Doc update flow (suggest → validate → apply → reindex)
- Watch → detect change → invalidate → reindex flow
- HTTP API request → tool execution → response

#### External Service Integration - PARTIAL TESTS

Existing: Basic API initialization tests
Missing:

- Error handling for API failures
- Rate limiting behavior
- Retry logic
- Timeout handling
- Response parsing edge cases

## Test Quality Issues

### Current Tests Limitations

1. Integration tests only verify initialization, not actual functionality
2. No error path testing
3. No edge case coverage
4. No concurrent operation testing
5. No performance/stress testing
6. No mock/stub usage - tests require actual API keys

## Recommendations Priority

### Critical (Must Add)

1. `milvus.ts` - Storage layer is untested
2. `doc-parser.ts` - Core parsing logic is untested
3. `chunker.ts` - Chunking affects RAG quality
4. End-to-end RAG pipeline test
5. Fact conflict detection tests

### High Priority

1. `pipeline.ts` - Complete RAG flow
2. `embedder.ts` - Caching and batch behavior
3. `doc-update.ts` - Update system
4. `search-cache.ts` - Cache correctness

### Medium Priority

1. All analysis/facts modules
2. Watchers
3. Tool functions
4. HTTP server

### Low Priority

1. Cached search wrappers (simple pass-through)
2. Utility functions with trivial logic