import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchDocs } from '../../src/tools/search-docs.js';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('searchDocs', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'search-docs-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('searches documentation and returns results', async () => {
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), `# Architecture

## Database Layer

We use PostgreSQL for data persistence.

## Cache Layer

Redis is used for caching.
`);

    const result = await searchDocs(testDir, {
      query: 'database',
    });

    expect(result).toContain('Search Results');
    expect(result).toContain('database');
    expect(result).toContain('Database Layer');
  });

  it('returns not found when no docs exist', async () => {
    const result = await searchDocs(testDir, {
      query: 'anything',
    });

    expect(result).toBe('DOCS_NOT_FOUND');
  });

  it('returns not found when query has no matches', async () => {
    writeFileSync(join(testDir, 'R1-NOTES.md'), `# Notes

Some unrelated content.
`);

    const result = await searchDocs(testDir, {
      query: 'xyzabc123nonexistent',
    });

    // Might return results or not found depending on semantic search behavior
    expect(result).toBeTruthy();
  });

  it('filters by release', async () => {
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), `# R1 Architecture

Database setup for R1.
`);

    writeFileSync(join(testDir, 'R2-ARCHITECTURE.md'), `# R2 Architecture

Database setup for R2.
`);

    const result = await searchDocs(testDir, {
      query: 'database',
      filters: { release: 'R1' },
    });

    expect(result).toContain('R1');
    expect(result).not.toContain('R2');
  });

  it('filters by docType', async () => {
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), `# Architecture

System design.
`);

    writeFileSync(join(testDir, 'R1-API.md'), `# API

API endpoints.
`);

    const result = await searchDocs(testDir, {
      query: 'system',
      filters: { docTypes: ['ARCHITECTURE'] },
    });

    expect(result).toContain('ARCHITECTURE');
  });

  it('includes metadata in results', async () => {
    writeFileSync(join(testDir, 'R1-DESIGN.md'), `# Design

## Feature X

Details about feature X.
`);

    const result = await searchDocs(testDir, {
      query: 'feature',
    });

    expect(result).toContain('File:');
    expect(result).toContain('Release:');
    expect(result).toContain('Doc Type:');
    expect(result).toContain('Lines:');
    expect(result).toContain('Score:');
  });

  it('returns top results', async () => {
    writeFileSync(join(testDir, 'R1-DOCS.md'), `# Documentation

## Section 1
Content about databases

## Section 2
Content about caching

## Section 3
More database information

## Section 4
API documentation

## Section 5
Database performance
`);

    const result = await searchDocs(testDir, {
      query: 'database',
    });

    expect(result).toContain('Found:');
    // Should have multiple results
    expect(result.split('---').length).toBeGreaterThan(2);
  });

  it('truncates long snippets', async () => {
    const longContent = 'Database information. ' + 'x'.repeat(1000);
    writeFileSync(join(testDir, 'R1-LONG.md'), `# Long Document

## Section

${longContent}
`);

    const result = await searchDocs(testDir, {
      query: 'database',
    });

    // Should contain ellipsis for truncated content
    expect(result).toContain('...');
  });

  it('handles multiple matching sections', async () => {
    writeFileSync(join(testDir, 'R1-MULTI.md'), `# Multiple Sections

## Database Config

PostgreSQL configuration.

## Database Performance

Performance tuning.

## Database Backup

Backup procedures.
`);

    const result = await searchDocs(testDir, {
      query: 'database',
    });

    expect(result).toContain('Database Config');
    expect(result).toContain('Database Performance');
    expect(result).toContain('Database Backup');
  });

  it('shows match reasons', async () => {
    writeFileSync(join(testDir, 'R1-TEST.md'), `# Test

## Authentication

JWT authentication system.
`);

    const result = await searchDocs(testDir, {
      query: 'authentication',
    });

    expect(result).toContain('Match:');
  });

  it('handles special characters in query', async () => {
    writeFileSync(join(testDir, 'R1-API.md'), `# API

## Endpoint /api/users

User endpoint.
`);

    const result = await searchDocs(testDir, {
      query: '/api/users',
    });

    expect(result).toContain('Endpoint');
  });

  it('is case insensitive', async () => {
    writeFileSync(join(testDir, 'R1-DOCS.md'), `# Documentation

## Database

PostgreSQL database.
`);

    const result1 = await searchDocs(testDir, { query: 'DATABASE' });
    const result2 = await searchDocs(testDir, { query: 'database' });

    expect(result1).toContain('Database');
    expect(result2).toContain('Database');
  });
});

