import { describe, it, expect } from 'vitest';
import { getDocIndex, invalidateDocIndex } from '../../src/utils/doc-index.js';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('getDocIndex', () => {
  it('builds index and caches it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docs-'));
    try {
      const file = join(dir, 'R1-ARCHITECTURE.md');
      writeFileSync(file, '# Title\n\nContent');

      const index1 = getDocIndex(dir, { ttlMs: 10000 });
      const index2 = getDocIndex(dir, { ttlMs: 10000 });

      expect(index1.fingerprint).toBeTypeOf('string');
      expect(index1.sections.length).toBeGreaterThan(0);
      expect(index2.fingerprint).toEqual(index1.fingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('invalidates cache', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docs-'));
    try {
      const file = join(dir, 'R1-ARCHITECTURE.md');
      writeFileSync(file, '# Title\n\nContent');

      const index1 = getDocIndex(dir, { ttlMs: 10000 });
      invalidateDocIndex(dir);

      // touch file to change mtime
      writeFileSync(file, '# Title\n\nContent updated');
      const index2 = getDocIndex(dir, { ttlMs: 10000 });
      expect(index2.fingerprint).not.toEqual(index1.fingerprint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


