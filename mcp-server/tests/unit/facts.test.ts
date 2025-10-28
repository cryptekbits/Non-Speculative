import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  canonicalizeValue,
  computeFactKey,
  computeFactHashFromParts,
  createFact,
} from '../../src/analysis/facts.js';

describe('normalizeText', () => {
  it('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('normalizes line endings', () => {
    expect(normalizeText('hello\r\nworld')).toBe('hello world');
    expect(normalizeText('hello\rworld')).toBe('hello world');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('hello    world')).toBe('hello world');
  });

  it('converts to lowercase', () => {
    expect(normalizeText('Hello World')).toBe('hello world');
  });

  it('handles all together', () => {
    expect(normalizeText('  Hello\r\n  World  ')).toBe('hello world');
  });
});

describe('canonicalizeValue', () => {
  it('normalizes numbers', () => {
    expect(canonicalizeValue('1,234')).toBe('1234');
    expect(canonicalizeValue('1 234')).toBe('1234');
    expect(canonicalizeValue('42')).toBe('42');
  });

  it('normalizes booleans', () => {
    expect(canonicalizeValue('true')).toBe('true');
    expect(canonicalizeValue('True')).toBe('true');
    expect(canonicalizeValue('TRUE')).toBe('true');
    expect(canonicalizeValue('false')).toBe('false');
    expect(canonicalizeValue('False')).toBe('false');
  });

  it('normalizes text for non-numbers', () => {
    expect(canonicalizeValue('Hello World')).toBe('hello world');
  });

  it('handles edge cases', () => {
    expect(canonicalizeValue('  42  ')).toBe('42');
    expect(canonicalizeValue('  text  ')).toBe('text');
  });
});

describe('computeFactKey', () => {
  it('creates normalized key from subject and predicate', () => {
    const key = computeFactKey('Database', 'is');
    expect(key).toBe('database::is');
  });

  it('handles whitespace and case', () => {
    const key1 = computeFactKey('  Database  ', '  is  ');
    const key2 = computeFactKey('database', 'is');
    expect(key1).toBe(key2);
  });

  it('creates different keys for different predicates', () => {
    const key1 = computeFactKey('Database', 'is');
    const key2 = computeFactKey('Database', 'has');
    expect(key1).not.toBe(key2);
  });
});

describe('computeFactHashFromParts', () => {
  it('creates consistent hash', () => {
    const hash1 = computeFactHashFromParts('Database', 'is', 'PostgreSQL');
    const hash2 = computeFactHashFromParts('Database', 'is', 'PostgreSQL');
    expect(hash1).toBe(hash2);
  });

  it('normalizes before hashing', () => {
    const hash1 = computeFactHashFromParts('Database', 'is', 'PostgreSQL');
    const hash2 = computeFactHashFromParts('  DATABASE  ', '  is  ', '  postgresql  ');
    expect(hash1).toBe(hash2);
  });

  it('creates different hashes for different values', () => {
    const hash1 = computeFactHashFromParts('Database', 'is', 'PostgreSQL');
    const hash2 = computeFactHashFromParts('Database', 'is', 'MySQL');
    expect(hash1).not.toBe(hash2);
  });

  it('handles numbers consistently', () => {
    const hash1 = computeFactHashFromParts('Port', 'is', '8080');
    const hash2 = computeFactHashFromParts('Port', 'is', '8,080');
    expect(hash1).toBe(hash2); // Numbers are canonicalized
  });
});

describe('createFact', () => {
  it('creates fact with all fields', () => {
    const fact = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'R1-ARCHITECTURE.md',
      heading: 'Data Layer',
      lineStart: 10,
      lineEnd: 10,
    });

    expect(fact.subject).toBe('Database');
    expect(fact.predicate).toBe('is');
    expect(fact.object).toBe('PostgreSQL');
    expect(fact.file).toBe('R1-ARCHITECTURE.md');
    expect(fact.heading).toBe('Data Layer');
    expect(fact.lineStart).toBe(10);
    expect(fact.lineEnd).toBe(10);
    expect(fact.normalized).toBeTruthy();
    expect(fact.hash).toBeTruthy();
    expect(fact.hash).toHaveLength(40); // SHA1 hex
  });

  it('trims subject, predicate, and object', () => {
    const fact = createFact({
      subject: '  Database  ',
      predicate: '  is  ',
      object: '  PostgreSQL  ',
      file: 'test.md',
    });

    expect(fact.subject).toBe('Database');
    expect(fact.predicate).toBe('is');
    expect(fact.object).toBe('PostgreSQL');
  });

  it('creates normalized string', () => {
    const fact = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'test.md',
    });

    expect(fact.normalized).toBe('database|is|postgresql');
  });

  it('handles optional fields', () => {
    const fact = createFact({
      subject: 'Subject',
      predicate: 'pred',
      object: 'Object',
      file: 'file.md',
    });

    expect(fact.heading).toBeUndefined();
    expect(fact.lineStart).toBeUndefined();
    expect(fact.lineEnd).toBeUndefined();
  });

  it('creates consistent hashes for equivalent facts', () => {
    const fact1 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'file1.md',
    });

    const fact2 = createFact({
      subject: '  DATABASE  ',
      predicate: '  is  ',
      object: '  postgresql  ',
      file: 'file2.md',
    });

    expect(fact1.hash).toBe(fact2.hash);
  });

  it('creates different hashes for different facts', () => {
    const fact1 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'test.md',
    });

    const fact2 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'MySQL',
      file: 'test.md',
    });

    expect(fact1.hash).not.toBe(fact2.hash);
  });
});

