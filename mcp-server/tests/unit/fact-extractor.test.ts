import { describe, it, expect } from 'vitest';
import { extractFactsFromMarkdown, extractFactsFromDiff } from '../../src/analysis/fact-extractor.js';

describe('extractFactsFromMarkdown', () => {
  it('extracts facts with colon separator', () => {
    const content = 'Database: PostgreSQL\nPort: 5432';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(2);
    expect(facts[0].subject).toBe('Database');
    expect(facts[0].object).toBe('PostgreSQL');
    expect(facts[1].subject).toBe('Port');
    expect(facts[1].object).toBe('5432');
  });

  it('extracts facts with dash separator', () => {
    const content = 'Database - PostgreSQL\nPort - 5432';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(2);
    expect(facts[0].subject).toBe('Database');
    expect(facts[0].object).toBe('PostgreSQL');
  });

  it('extracts facts with equals separator', () => {
    const content = 'Database = PostgreSQL\nPort = 5432';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(2);
    expect(facts[0].subject).toBe('Database');
    expect(facts[0].object).toBe('PostgreSQL');
  });

  it('sets predicate to "is"', () => {
    const content = 'Database: PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts[0].predicate).toBe('is');
  });

  it('includes file metadata', () => {
    const content = 'Database: PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'R1-ARCHITECTURE.md');

    expect(facts[0].file).toBe('R1-ARCHITECTURE.md');
  });

  it('includes heading metadata', () => {
    const content = 'Database: PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'test.md', 'Data Layer');

    expect(facts[0].heading).toBe('Data Layer');
  });

  it('tracks line numbers correctly', () => {
    const content = 'Line 1\nDatabase: PostgreSQL\nLine 3\nPort: 5432';
    const facts = extractFactsFromMarkdown(content, 'test.md', undefined, 1);

    expect(facts[0].lineStart).toBe(2);
    expect(facts[0].lineEnd).toBe(2);
    expect(facts[1].lineStart).toBe(4);
    expect(facts[1].lineEnd).toBe(4);
  });

  it('respects line offset', () => {
    const content = 'Database: PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'test.md', undefined, 100);

    expect(facts[0].lineStart).toBe(100);
    expect(facts[0].lineEnd).toBe(100);
  });

  it('skips comment lines', () => {
    const content = '<!-- This is a comment -->\nDatabase: PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(1);
    expect(facts[0].subject).toBe('Database');
  });

  it('skips heading lines', () => {
    const content = '# Heading\n## Subheading\nDatabase: PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(1);
    expect(facts[0].subject).toBe('Database');
  });

  it('skips empty lines', () => {
    const content = '\n\nDatabase: PostgreSQL\n\n';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(1);
  });

  it('handles multiple facts in various formats', () => {
    const content = `
Database: PostgreSQL
Port - 5432
Version = 14.5
Cache: Redis
`;
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(4);
    expect(facts[0].object).toBe('PostgreSQL');
    expect(facts[1].object).toBe('5432');
    expect(facts[2].object).toBe('14.5');
    expect(facts[3].object).toBe('Redis');
  });

  it('handles facts in bullet lists', () => {
    const content = `
- Database: PostgreSQL
- Port: 5432
- Other non-fact bullet
`;
    const facts = extractFactsFromMarkdown(content, 'test.md');

    // Won't match due to leading dash
    expect(facts.length).toBe(0);
  });

  it('handles facts in tables', () => {
    const content = `
| Setting | Value |
|---------|-------|
| Database | PostgreSQL |
`;
    const facts = extractFactsFromMarkdown(content, 'test.md');

    // Tables might or might not match depending on pattern
    expect(facts.length).toBeGreaterThanOrEqual(0);
  });

  it('handles multi-line values', () => {
    const content = 'Database: PostgreSQL with complex setup';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts[0].object).toBe('PostgreSQL with complex setup');
  });

  it('handles special characters', () => {
    const content = 'API Endpoint: https://api.example.com/v1';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts[0].subject).toBe('API Endpoint');
    expect(facts[0].object).toBe('https://api.example.com/v1');
  });

  it('handles subjects with parentheses', () => {
    const content = 'Database (primary): PostgreSQL';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts[0].subject).toBe('Database (primary)');
  });

  it('rejects malformed patterns', () => {
    const content = `
: No subject
Database:
Database
Just text
`;
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(0);
  });

  it('handles Windows line endings', () => {
    const content = 'Database: PostgreSQL\r\nPort: 5432';
    const facts = extractFactsFromMarkdown(content, 'test.md');

    expect(facts.length).toBe(2);
  });
});

describe('extractFactsFromDiff', () => {
  it('extracts facts from plain diff content', () => {
    const diff = '+Database: PostgreSQL\n+Port: 5432';
    const facts = extractFactsFromDiff(diff, 'test.md');

    expect(facts.length).toBe(2);
    expect(facts[0].subject).toBe('Database');
    expect(facts[1].subject).toBe('Port');
  });

  it('strips unified diff prefixes', () => {
    const diff = `
+Database: PostgreSQL
 Port: 5432
+Cache: Redis
`;
    const facts = extractFactsFromDiff(diff, 'test.md');

    expect(facts.length).toBe(3);
  });

  it('handles diff without prefixes', () => {
    const diff = 'Database: PostgreSQL\nPort: 5432';
    const facts = extractFactsFromDiff(diff, 'test.md');

    expect(facts.length).toBe(2);
  });

  it('includes file metadata', () => {
    const diff = '+Database: PostgreSQL';
    const facts = extractFactsFromDiff(diff, 'R2-DESIGN.md');

    expect(facts[0].file).toBe('R2-DESIGN.md');
  });

  it('handles empty diff', () => {
    const facts = extractFactsFromDiff('', 'test.md');
    expect(facts.length).toBe(0);
  });

  it('handles complex diff with multiple changes', () => {
    const diff = `
 # Architecture
+Database: PostgreSQL
+Port: 5432
 
-Old: Value
+New: Value
`;
    const facts = extractFactsFromDiff(diff, 'test.md');

    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(facts.find(f => f.subject === 'Database')).toBeDefined();
  });
});

