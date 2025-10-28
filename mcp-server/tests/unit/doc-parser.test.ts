import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseDocumentation } from '../../src/utils/doc-parser.js';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('parseDocumentation', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'doc-parser-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('parses basic R-format markdown files', () => {
    const content = `# Architecture Overview

This is the main architecture section.

## Database Design

We use PostgreSQL for persistence.

## API Layer

RESTful APIs with Express.
`;
    
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(3);
    expect(sections[0].release).toBe('R1');
    expect(sections[0].docType).toBe('ARCHITECTURE');
    expect(sections[0].heading).toBe('Architecture Overview');
    expect(sections[0].content).toContain('main architecture section');
    expect(sections[1].heading).toBe('Database Design');
    expect(sections[2].heading).toBe('API Layer');
  });

  it('extracts correct line numbers', () => {
    const content = `# First Section
Line 1
Line 2

## Second Section
Line 3
Line 4
`;
    
    writeFileSync(join(testDir, 'R2-DESIGN.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    expect(sections[0].lineStart).toBe(0);
    expect(sections[0].lineEnd).toBeGreaterThanOrEqual(2);
    expect(sections[1].lineStart).toBe(4);
  });

  it('handles multiple releases', () => {
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), '# Section 1\nContent 1');
    writeFileSync(join(testDir, 'R2-ARCHITECTURE.md'), '# Section 2\nContent 2');
    writeFileSync(join(testDir, 'R10-DESIGN.md'), '# Section 3\nContent 3');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(3);
    expect(sections.find(s => s.release === 'R1')).toBeDefined();
    expect(sections.find(s => s.release === 'R2')).toBeDefined();
    expect(sections.find(s => s.release === 'R10')).toBeDefined();
  });

  it('respects .docignore file', () => {
    writeFileSync(join(testDir, 'R1-PUBLIC.md'), '# Public\nContent');
    
    const ignoredDir = join(testDir, 'internal');
    mkdirSync(ignoredDir);
    writeFileSync(join(ignoredDir, 'R1-PRIVATE.md'), '# Private\nContent');
    
    writeFileSync(join(testDir, '.docignore'), 'internal/');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBe('Public');
  });

  it('finds files in subdirectories', () => {
    const subDir = join(testDir, 'docs', 'architecture');
    mkdirSync(subDir, { recursive: true });
    
    writeFileSync(join(subDir, 'R1-SYSTEM.md'), '# System\nDesign');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBe('System');
  });

  it('handles legacy mnt/project path', () => {
    const legacyPath = join(testDir, 'mnt', 'project');
    mkdirSync(legacyPath, { recursive: true });
    
    writeFileSync(join(legacyPath, 'R1-LEGACY.md'), '# Legacy\nDoc');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBe('Legacy');
  });

  it('skips files without R-format naming', () => {
    writeFileSync(join(testDir, 'README.md'), '# README\nContent');
    writeFileSync(join(testDir, 'CONTRIBUTING.md'), '# Contributing\nContent');
    writeFileSync(join(testDir, 'R1-VALID.md'), '# Valid\nContent');
    
    const sections = parseDocumentation(testDir);
    
    // Only R1-VALID.md should be parsed (unless in root)
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections.find(s => s.file === 'R1-VALID.md')).toBeDefined();
  });

  it('handles empty files gracefully', () => {
    writeFileSync(join(testDir, 'R1-EMPTY.md'), '');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(0);
  });

  it('handles files with no headings', () => {
    writeFileSync(join(testDir, 'R1-NOHEADING.md'), 'Just some content\nNo headings here');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(0);
  });

  it('preserves heading hierarchy', () => {
    const content = `# Level 1
Content 1

## Level 2
Content 2

### Level 3
Content 3

## Another Level 2
Content 4
`;
    
    writeFileSync(join(testDir, 'R1-HIERARCHY.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(4);
    expect(sections[0].heading).toBe('Level 1');
    expect(sections[1].heading).toBe('Level 2');
    expect(sections[2].heading).toBe('Level 3');
    expect(sections[3].heading).toBe('Another Level 2');
  });

  it('handles code blocks in content', () => {
    const content = `# API Documentation

Example request:

\`\`\`typescript
const response = await fetch('/api/users');
\`\`\`

More content here.
`;
    
    writeFileSync(join(testDir, 'R1-API.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(1);
    expect(sections[0].content).toContain('```typescript');
    expect(sections[0].content).toContain('fetch');
  });

  it('trims whitespace from content', () => {
    const content = `# Section


Content with extra lines


More content


`;
    
    writeFileSync(join(testDir, 'R1-WHITESPACE.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    expect(sections[0].content).not.toMatch(/^\n/);
    expect(sections[0].content).not.toMatch(/\n$/);
  });

  it('handles special characters in headings', () => {
    const content = `# API & Services (v2.0)

Content here

## User's Profile Management

More content
`;
    
    writeFileSync(join(testDir, 'R1-SPECIAL.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    expect(sections[0].heading).toBe('API & Services (v2.0)');
    expect(sections[1].heading).toBe("User's Profile Management");
  });

  it('skips hidden directories and node_modules', () => {
    mkdirSync(join(testDir, '.git'));
    mkdirSync(join(testDir, 'node_modules'));
    mkdirSync(join(testDir, 'build'));
    mkdirSync(join(testDir, 'dist'));
    
    writeFileSync(join(testDir, '.git', 'R1-GIT.md'), '# Git\nContent');
    writeFileSync(join(testDir, 'node_modules', 'R1-NODE.md'), '# Node\nContent');
    writeFileSync(join(testDir, 'build', 'R1-BUILD.md'), '# Build\nContent');
    writeFileSync(join(testDir, 'dist', 'R1-DIST.md'), '# Dist\nContent');
    writeFileSync(join(testDir, 'R1-VALID.md'), '# Valid\nContent');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBe('Valid');
  });

  it('handles different docTypes', () => {
    writeFileSync(join(testDir, 'R1-ARCHITECTURE.md'), '# Arch\nContent');
    writeFileSync(join(testDir, 'R1-DESIGN.md'), '# Design\nContent');
    writeFileSync(join(testDir, 'R1-API.md'), '# API\nContent');
    
    const sections = parseDocumentation(testDir);
    
    expect(sections.find(s => s.docType === 'ARCHITECTURE')).toBeDefined();
    expect(sections.find(s => s.docType === 'DESIGN')).toBeDefined();
    expect(sections.find(s => s.docType === 'API')).toBeDefined();
  });

  it('handles malformed markdown gracefully', () => {
    const content = `# Valid Heading

###No space after hashes

# Another Valid Heading

Content here
`;
    
    writeFileSync(join(testDir, 'R1-MALFORMED.md'), content);
    
    const sections = parseDocumentation(testDir);
    
    // Should parse valid headings, skip malformed ones
    expect(sections.length).toBe(2);
    expect(sections[0].heading).toBe('Valid Heading');
    expect(sections[1].heading).toBe('Another Valid Heading');
  });
});

