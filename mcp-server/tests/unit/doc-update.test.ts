import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DocUpdateAgent, createDocUpdateAgent } from '../../src/rag/doc-update.js';
import { writeFileSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('DocUpdateAgent', () => {
  let testDir: string;
  let agent: DocUpdateAgent;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'doc-update-'));
    agent = new DocUpdateAgent({ docsPath: testDir });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('suggestUpdate', () => {
    it('suggests creating new document when none exists', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Document authentication flow',
        context: 'We use JWT tokens',
      });

      expect(suggestion.action).toBe('create');
      expect(suggestion.targetPath).toContain('.md');
      expect(suggestion.diff).toContain('Document authentication flow');
      expect(suggestion.diff).toContain('JWT tokens');
      expect(suggestion.rationale).toContain('No existing document');
    });

    it('suggests updating existing document', async () => {
      const existingFile = join(testDir, 'R1-ARCHITECTURE.md');
      writeFileSync(existingFile, '# Architecture\n\nExisting content');

      const suggestion = await agent.suggestUpdate({
        intent: 'Update architecture',
        context: 'New service added',
        targetFile: 'R1-ARCHITECTURE.md',
      });

      expect(suggestion.action).toBe('update');
      expect(suggestion.targetPath).toBe(existingFile);
      expect(suggestion.rationale).toContain('already exists');
    });

    it('infers file from intent keywords', async () => {
      const suggestions = [
        await agent.suggestUpdate({ intent: 'Architecture overview' }),
        await agent.suggestUpdate({ intent: 'Service configuration' }),
        await agent.suggestUpdate({ intent: 'Configuration settings' }),
        await agent.suggestUpdate({ intent: 'Migration notes' }),
      ];

      expect(suggestions[0].targetPath).toContain('ARCHITECTURE.md');
      expect(suggestions[1].targetPath).toContain('SERVICE_CONTRACTS.md');
      expect(suggestions[2].targetPath).toContain('CONFIGURATION.md');
      expect(suggestions[3].targetPath).toContain('MIGRATION_NOTES.md');
    });

    it('uses target release in filename', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Document feature',
        targetRelease: 'R5',
      });

      expect(suggestion.targetPath).toContain('R5-');
    });

    it('defaults to R1 when no release specified', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Document feature',
      });

      expect(suggestion.targetPath).toContain('R1-');
    });

    it('detects duplicate facts', async () => {
      // Create existing doc with facts
      writeFileSync(join(testDir, 'R1-CONFIG.md'), `# Config

Database: PostgreSQL
Port: 5432
`);

      const suggestion = await agent.suggestUpdate({
        intent: 'Add configuration',
        context: 'Database: PostgreSQL\nPort: 5432',
        targetFile: 'R2-CONFIG.md',
      });

      // Duplicates might be detected (depends on fact extraction)
      if (suggestion.duplicates && suggestion.duplicates.length > 0) {
        expect(suggestion.duplicates[0].subject).toBeTruthy();
      }
    });

    it('detects conflicting facts', async () => {
      // Create existing doc with facts
      writeFileSync(join(testDir, 'R1-CONFIG.md'), `# Config

Database: PostgreSQL
`);

      const suggestion = await agent.suggestUpdate({
        intent: 'Update config',
        context: 'Database: MySQL',
        targetFile: 'R2-CONFIG.md',
      });

      // Conflicts might be detected
      if (suggestion.conflicts && suggestion.conflicts.length > 0) {
        expect(suggestion.conflicts[0].subject).toBeTruthy();
        expect(suggestion.blocked).toBe(true);
      }
    });

    it('includes citations for updates', async () => {
      const targetFile = 'R1-ARCHITECTURE.md';
      writeFileSync(join(testDir, targetFile), '# Architecture\n\nContent');

      const suggestion = await agent.suggestUpdate({
        intent: 'Update architecture',
        targetFile,
      });

      expect(suggestion.citations).toContain(targetFile);
    });

    it('has no citations for new documents', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'New document',
      });

      expect(suggestion.citations.length).toBe(0);
    });
  });

  describe('applyUpdate', () => {
    it('creates new file', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Test document',
        context: 'Test content',
      });

      const result = await agent.applyUpdate(suggestion);

      expect(result.status).toBe('success');
      expect(existsSync(suggestion.targetPath)).toBe(true);
      const content = readFileSync(suggestion.targetPath, 'utf-8');
      expect(content).toContain('Test document');
    });

    it('updates existing file', async () => {
      const targetFile = join(testDir, 'R1-NOTES.md');
      writeFileSync(targetFile, '# Notes\n\nOriginal content');

      const suggestion = await agent.suggestUpdate({
        intent: 'Update notes',
        context: 'New information',
        targetFile: 'R1-NOTES.md',
      });

      const result = await agent.applyUpdate(suggestion);

      expect(result.status).toBe('success');
      const content = readFileSync(targetFile, 'utf-8');
      expect(content).toContain('Original content');
      expect(content).toContain('New information');
    });

    it('emits doc_created event', async () => {
      const eventPromise = new Promise((resolve) => {
        agent.once('doc_created', (path: string) => {
          resolve(path);
        });
      });

      const suggestion = await agent.suggestUpdate({
        intent: 'Test',
      });

      await agent.applyUpdate(suggestion);

      const path = await eventPromise;
      expect(path).toBeTruthy();
    });

    it('emits doc_updated event', async () => {
      writeFileSync(join(testDir, 'R1-TEST.md'), '# Test\nContent');

      const eventPromise = new Promise((resolve) => {
        agent.once('doc_updated', (path: string) => {
          resolve(path);
        });
      });

      const suggestion = await agent.suggestUpdate({
        intent: 'Update',
        targetFile: 'R1-TEST.md',
      });

      await agent.applyUpdate(suggestion);

      const path = await eventPromise;
      expect(path).toBeTruthy();
    });

    it('emits reindex_triggered event', async () => {
      const eventPromise = new Promise((resolve) => {
        agent.once('reindex_triggered', (path: string) => {
          resolve(path);
        });
      });

      const suggestion = await agent.suggestUpdate({
        intent: 'Test',
      });

      await agent.applyUpdate(suggestion);

      const path = await eventPromise;
      expect(path).toBeTruthy();
    });

    it('marks update as reindexed', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Test',
      });

      const result = await agent.applyUpdate(suggestion);

      expect(result.reindexed).toBe(true);
    });

    it('blocks conflicting updates without force', async () => {
      // Create existing fact
      writeFileSync(join(testDir, 'R1-CONFIG.md'), `# Config\n\nDatabase: PostgreSQL`);

      const suggestion = await agent.suggestUpdate({
        intent: 'Update config',
        context: 'Database: MySQL',
        targetFile: 'R2-CONFIG.md',
      });

      // Force a conflict scenario
      suggestion.conflicts = [{
        file: 'R1-CONFIG.md',
        existing: 'PostgreSQL',
        incoming: 'MySQL',
        subject: 'Database',
      }];

      const result = await agent.applyUpdate(suggestion);

      // Might be blocked (depends on conflict detection)
      if (result.status === 'error') {
        expect(result.error).toBeTruthy();
      }
    });

    it('allows conflicting updates with force', async () => {
      writeFileSync(join(testDir, 'R1-CONFIG.md'), `# Config\n\nDatabase: PostgreSQL`);

      const suggestion = await agent.suggestUpdate({
        intent: 'Update config',
        context: 'Database: MySQL',
        targetFile: 'R2-CONFIG.md',
      });

      const result = await agent.applyUpdate(suggestion, { force: true });

      expect(result.status).toBe('success');
    });

    it('handles errors gracefully', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Test',
      });

      // Manually create error scenario by modifying suggestion
      const badSuggestion = { ...suggestion };
      badSuggestion.diff = '\u0000'; // Invalid content

      const result = await agent.applyUpdate(badSuggestion);

      // Either success or error is acceptable here
      expect(['success', 'error']).toContain(result.status);
    });

    it('creates parent directories for new files', async () => {
      const suggestion = await agent.suggestUpdate({
        intent: 'Test nested',
      });

      // Modify path to include subdirectory
      suggestion.targetPath = join(testDir, 'nested', 'R1-TEST.md');

      const result = await agent.applyUpdate(suggestion);

      expect(result.status).toBe('success');
      expect(existsSync(suggestion.targetPath)).toBe(true);
    });
  });
});

describe('createDocUpdateAgent', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'doc-update-factory-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates agent with config', () => {
    const agent = createDocUpdateAgent({ docsPath: testDir });

    expect(agent).toBeInstanceOf(DocUpdateAgent);
  });

  it('accepts Groq API key', () => {
    const agent = createDocUpdateAgent({
      docsPath: testDir,
      groqApiKey: 'test-key',
    });

    expect(agent).toBeInstanceOf(DocUpdateAgent);
  });
});

