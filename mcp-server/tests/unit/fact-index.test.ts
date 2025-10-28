import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildFactIndex,
  insertFact,
  findDuplicates,
  findConflicts,
  FactIndex,
} from '../../src/analysis/fact-index.js';
import { createFact } from '../../src/analysis/facts.js';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('insertFact', () => {
  let index: FactIndex;

  beforeEach(() => {
    index = { byKey: new Map() };
  });

  it('inserts a fact into empty index', () => {
    const fact = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'test.md',
    });

    insertFact(index, fact);

    expect(index.byKey.size).toBe(1);
    const entry = index.byKey.get('database::is');
    expect(entry).toBeDefined();
    expect(entry!.values.size).toBe(1);
  });

  it('groups facts by normalized key', () => {
    const fact1 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'test.md',
    });

    const fact2 = createFact({
      subject: '  database  ',
      predicate: '  is  ',
      object: 'MySQL',
      file: 'test.md',
    });

    insertFact(index, fact1);
    insertFact(index, fact2);

    expect(index.byKey.size).toBe(1); // Same key
    const entry = index.byKey.get('database::is');
    expect(entry!.values.size).toBe(2); // Different values
  });

  it('groups duplicate values together', () => {
    const fact1 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'file1.md',
    });

    const fact2 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'postgresql', // Same value, different case
      file: 'file2.md',
    });

    insertFact(index, fact1);
    insertFact(index, fact2);

    const entry = index.byKey.get('database::is');
    expect(entry!.values.size).toBe(1); // Same canonical value
    const facts = entry!.values.get('postgresql');
    expect(facts!.length).toBe(2); // Both facts stored
  });

  it('handles different predicates separately', () => {
    const fact1 = createFact({
      subject: 'Service',
      predicate: 'is',
      object: 'Auth',
      file: 'test.md',
    });

    const fact2 = createFact({
      subject: 'Service',
      predicate: 'has',
      object: 'API',
      file: 'test.md',
    });

    insertFact(index, fact1);
    insertFact(index, fact2);

    expect(index.byKey.size).toBe(2); // Different predicates
  });
});

describe('findDuplicates', () => {
  let index: FactIndex;

  beforeEach(() => {
    index = { byKey: new Map() };
  });

  it('finds exact duplicates', () => {
    const existing = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'existing.md',
    });

    const duplicate = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'new.md',
    });

    insertFact(index, existing);
    const dups = findDuplicates(index, [duplicate]);

    expect(dups.length).toBe(1);
    expect(dups[0].existing).toEqual(existing);
    expect(dups[0].duplicate).toEqual(duplicate);
  });

  it('finds duplicates with case differences', () => {
    const existing = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'existing.md',
    });

    const duplicate = createFact({
      subject: 'database',
      predicate: 'is',
      object: 'postgresql',
      file: 'new.md',
    });

    insertFact(index, existing);
    const dups = findDuplicates(index, [duplicate]);

    expect(dups.length).toBe(1);
  });

  it('does not find non-duplicates', () => {
    const existing = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'existing.md',
    });

    const different = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'MySQL',
      file: 'new.md',
    });

    insertFact(index, existing);
    const dups = findDuplicates(index, [different]);

    expect(dups.length).toBe(0);
  });

  it('handles empty index', () => {
    const fact = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'test.md',
    });

    const dups = findDuplicates(index, [fact]);
    expect(dups.length).toBe(0);
  });

  it('finds multiple duplicates', () => {
    const existing1 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'file1.md',
    });

    const existing2 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'file2.md',
    });

    const duplicate = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'new.md',
    });

    insertFact(index, existing1);
    insertFact(index, existing2);
    const dups = findDuplicates(index, [duplicate]);

    expect(dups.length).toBe(2); // Matches both existing facts
  });
});

describe('findConflicts', () => {
  let index: FactIndex;

  beforeEach(() => {
    index = { byKey: new Map() };
  });

  it('finds conflicting values', () => {
    const existing = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'existing.md',
    });

    const conflicting = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'MySQL',
      file: 'new.md',
    });

    insertFact(index, existing);
    const conflicts = findConflicts(index, [conflicting]);

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].existing).toEqual(existing);
    expect(conflicts[0].conflicting).toEqual(conflicting);
    expect(conflicts[0].reason).toContain('Different value');
    expect(conflicts[0].reason).toContain('PostgreSQL');
    expect(conflicts[0].reason).toContain('MySQL');
  });

  it('does not report duplicates as conflicts', () => {
    const existing = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'existing.md',
    });

    const duplicate = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'postgresql',
      file: 'new.md',
    });

    insertFact(index, existing);
    const conflicts = findConflicts(index, [duplicate]);

    expect(conflicts.length).toBe(0);
  });

  it('finds multiple conflicts for same fact', () => {
    const existing1 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'file1.md',
    });

    const existing2 = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'MySQL',
      file: 'file2.md',
    });

    const conflicting = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'MongoDB',
      file: 'new.md',
    });

    insertFact(index, existing1);
    insertFact(index, existing2);
    const conflicts = findConflicts(index, [conflicting]);

    expect(conflicts.length).toBe(2); // Conflicts with both
  });

  it('handles empty index', () => {
    const fact = createFact({
      subject: 'Database',
      predicate: 'is',
      object: 'PostgreSQL',
      file: 'test.md',
    });

    const conflicts = findConflicts(index, [fact]);
    expect(conflicts.length).toBe(0);
  });

  it('does not conflict on different predicates', () => {
    const existing = createFact({
      subject: 'Service',
      predicate: 'is',
      object: 'Auth',
      file: 'existing.md',
    });

    const different = createFact({
      subject: 'Service',
      predicate: 'has',
      object: 'API',
      file: 'new.md',
    });

    insertFact(index, existing);
    const conflicts = findConflicts(index, [different]);

    expect(conflicts.length).toBe(0);
  });

  it('normalizes numbers when detecting conflicts', () => {
    const existing = createFact({
      subject: 'Port',
      predicate: 'is',
      object: '8080',
      file: 'existing.md',
    });

    const notConflicting = createFact({
      subject: 'Port',
      predicate: 'is',
      object: '8,080', // Same number, different format
      file: 'new.md',
    });

    const conflicting = createFact({
      subject: 'Port',
      predicate: 'is',
      object: '9090',
      file: 'new.md',
    });

    insertFact(index, existing);
    
    const conflicts1 = findConflicts(index, [notConflicting]);
    expect(conflicts1.length).toBe(0); // Not a conflict

    const conflicts2 = findConflicts(index, [conflicting]);
    expect(conflicts2.length).toBe(1); // Is a conflict
  });
});

describe('buildFactIndex', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'fact-index-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('builds index from documentation', () => {
    const content = `# Architecture

Database: PostgreSQL
Port: 5432

## Services

Auth Service: JWT-based
`;
    
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), content);
    
    const index = buildFactIndex(testDir);

    expect(index.byKey.size).toBeGreaterThan(0);
    
    const dbEntry = index.byKey.get('database::is');
    expect(dbEntry).toBeDefined();
  });

  it('handles multiple files', () => {
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), '# Arch\nDatabase: PostgreSQL');
    writeFileSync(join(testDir, 'R2-DESIGN.md'), '# Design\nCache: Redis');
    
    const index = buildFactIndex(testDir);

    expect(index.byKey.get('database::is')).toBeDefined();
    expect(index.byKey.get('cache::is')).toBeDefined();
  });

  it('groups facts by subject-predicate', () => {
    const content = `# Config

Database: PostgreSQL
Database: MySQL
Port: 5432
`;
    
    writeFileSync(join(testDir, 'R1-CONFIG.md'), content);
    
    const index = buildFactIndex(testDir);

    const dbEntry = index.byKey.get('database::is');
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.values.size).toBe(2); // PostgreSQL and MySQL
  });

  it('handles empty documentation', () => {
    const index = buildFactIndex(testDir);
    expect(index.byKey.size).toBe(0);
  });
});

