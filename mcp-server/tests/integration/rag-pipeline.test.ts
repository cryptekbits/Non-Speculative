import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseDocumentation } from '../../src/utils/doc-parser.js';
import { chunkSections } from '../../src/utils/chunker.js';
import { Embedder } from '../../src/rag/embedder.js';

/**
 * End-to-end RAG pipeline integration test
 * Tests the full flow: docs -> parse -> chunk -> embed -> search
 * Note: This test does not require Milvus/Groq/Cohere APIs
 */
describe('End-to-end RAG Pipeline (simplified)', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'e2e-rag-'));
    
    // Create sample documentation
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), `# Architecture Overview

## Database Layer

We use PostgreSQL 14 for our primary data store.
The database handles user data, transactions, and session information.

Connection pooling is managed by PgBouncer with a maximum of 100 connections.

## Cache Layer

Redis is used for caching frequently accessed data.
Cache TTL is set to 5 minutes for user sessions.

## API Layer

RESTful API built with Express.js.
All endpoints require JWT authentication.
`);

    writeFileSync(join(testDir, 'R1-SERVICE_CONTRACTS.md'), `# Service Contracts

## Authentication Service

Endpoint: POST /api/auth/login
Request: { email: string, password: string }
Response: { token: string, expiresIn: number }

## User Service

Endpoint: GET /api/users/:id
Requires: Bearer token
Response: { id: string, email: string, name: string }
`);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('parses documentation files', () => {
    const sections = parseDocumentation(testDir);

    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some(s => s.heading.includes('Database'))).toBe(true);
    expect(sections.some(s => s.heading.includes('Cache'))).toBe(true);
    expect(sections.some(s => s.heading.includes('Authentication'))).toBe(true);
  });

  it('chunks sections appropriately', () => {
    const sections = parseDocumentation(testDir);
    const chunks = chunkSections(sections, { maxTokens: 256 });

    expect(chunks.length).toBeGreaterThan(0);
    
    chunks.forEach(chunk => {
      expect(chunk.id).toBeTruthy();
      expect(chunk.content).toBeTruthy();
      expect(chunk.metadata.file).toBeTruthy();
      expect(chunk.metadata.heading).toBeTruthy();
      expect(chunk.tokens).toBeGreaterThan(0);
    });
  });

  it('generates embeddings for chunks', async () => {
    const sections = parseDocumentation(testDir);
    const chunks = chunkSections(sections, { maxTokens: 256 });
    
    const embedder = new Embedder({ provider: 'openai', dimensions: 128 });
    
    // Embed first few chunks
    const testChunks = chunks.slice(0, 3);
    const texts = testChunks.map(c => c.content);
    
    const result = await embedder.embedBatch(texts);

    expect(result.embeddings.length).toBe(testChunks.length);
    result.embeddings.forEach(emb => {
      expect(emb.length).toBe(128);
      expect(emb.every(v => typeof v === 'number')).toBe(true);
    });
  });

  it('embeddings capture semantic similarity', async () => {
    const embedder = new Embedder({ provider: 'openai', dimensions: 128 });

    // Similar queries should have higher similarity
    const query1 = 'database PostgreSQL storage';
    const query2 = 'database data store persistence';
    const query3 = 'authentication JWT tokens';

    const [emb1, emb2, emb3] = await Promise.all([
      embedder.embed(query1),
      embedder.embed(query2),
      embedder.embed(query3),
    ]);

    // Calculate cosine similarity
    const similarity = (a: number[], b: number[]) => {
      let dot = 0;
      let magA = 0;
      let magB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    };

    const sim12 = similarity(emb1.embedding, emb2.embedding);
    const sim13 = similarity(emb1.embedding, emb3.embedding);

    // Database queries should be more similar to each other than to auth query
    expect(sim12).toBeGreaterThan(sim13);
  });

  it('complete flow: parse -> chunk -> embed', async () => {
    // 1. Parse documentation
    const sections = parseDocumentation(testDir);
    expect(sections.length).toBeGreaterThan(0);

    // 2. Chunk sections
    const chunks = chunkSections(sections, { maxTokens: 256 });
    expect(chunks.length).toBeGreaterThan(0);

    // 3. Embed chunks
    const embedder = new Embedder({ provider: 'openai', dimensions: 128 });
    const texts = chunks.map(c => c.content);
    const { embeddings } = await embedder.embedBatch(texts);

    expect(embeddings.length).toBe(chunks.length);

    // 4. Verify data integrity
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].id).toBeTruthy();
      expect(embeddings[i].length).toBe(128);
      expect(chunks[i].metadata.file).toMatch(/\.md$/);
    }
  });

  it('retrieves relevant chunks for query (mock search)', async () => {
    // Parse and chunk
    const sections = parseDocumentation(testDir);
    const chunks = chunkSections(sections, { maxTokens: 256 });

    // Embed query and chunks
    const embedder = new Embedder({ provider: 'openai', dimensions: 128 });
    const query = 'How does authentication work?';
    const queryEmbedding = await embedder.embed(query);
    
    const chunkTexts = chunks.map(c => c.content);
    const { embeddings } = await embedder.embedBatch(chunkTexts);

    // Calculate similarities (mock search)
    const results = chunks.map((chunk, i) => {
      let dot = 0;
      for (let j = 0; j < 128; j++) {
        dot += queryEmbedding.embedding[j] * embeddings[i][j];
      }
      return { chunk, score: dot };
    });

    // Sort by relevance
    results.sort((a, b) => b.score - a.score);

    // Top result should be related to authentication
    const topResult = results[0];
    expect(topResult.chunk.content.toLowerCase()).toMatch(/auth|jwt|login|token/);
  });
});

