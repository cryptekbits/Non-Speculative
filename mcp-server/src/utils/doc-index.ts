import { createHash } from "crypto";
import { statSync, readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import { DocSection, parseDocumentation } from "./doc-parser.js";
import ignore from "ignore";

export interface DocIndex {
  sections: DocSection[];
  fingerprint: string;
  timestamp: number;
  fileCount: number;
}

export interface DocIndexOptions {
  ttlMs?: number;
  enableCache?: boolean;
}

interface CacheEntry {
  index: DocIndex;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class DocIndexManager {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTtlMs: number = DEFAULT_TTL_MS;

  /**
   * Get or build doc index for a path
   */
  getIndex(
    docsPath: string,
    options?: DocIndexOptions
  ): DocIndex {
    const ttlMs = options?.ttlMs ?? this.defaultTtlMs;
    const enableCache = options?.enableCache ?? true;

    // Check cache
    if (enableCache) {
      const cached = this.cache.get(docsPath);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.index;
      }
    }

    // Build new index
    const index = this.buildIndex(docsPath);

    // Cache it
    if (enableCache) {
      this.cache.set(docsPath, {
        index,
        expiresAt: Date.now() + ttlMs,
      });
    }

    return index;
  }

  /**
   * Build index from scratch
   */
  private buildIndex(docsPath: string): DocIndex {
    const startTime = Date.now();
    
    // Parse all documentation
    const sections = parseDocumentation(docsPath);

    // Calculate fingerprint based on file mtimes
    const fingerprint = this.calculateFingerprint(docsPath);

    const index: DocIndex = {
      sections,
      fingerprint,
      timestamp: Date.now(),
      fileCount: sections.length,
    };

    const elapsed = Date.now() - startTime;
    console.error(
      `📚 Indexed ${sections.length} sections in ${elapsed}ms (fingerprint: ${fingerprint.slice(0, 8)})`
    );

    return index;
  }

  /**
   * Calculate fingerprint based on file modification times
   */
  private calculateFingerprint(docsPath: string): string {
    const hash = createHash("sha256");
    const files: Array<{ path: string; mtime: number }> = [];
    const ig = this.loadDocIgnore(docsPath);

    /**
     * Recursively find all .md files and their modification times
     */
    const scanDirectory = (dir: string): void => {
      try {
        const entries = readdirSync(dir);

        for (const entry of entries) {
          // Skip hidden dirs and common exclusions
          if (
            entry.startsWith(".") ||
            entry === "node_modules" ||
            entry === "build" ||
            entry === "dist"
          ) {
            continue;
          }

          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (stat.isFile() && entry.endsWith(".md")) {
            // Apply .docignore filtering (normalize path separators for cross-platform)
            const relPath = relative(docsPath, fullPath);
            const relPathNorm = relPath.split('\\').join('/');
            if (ig && ig.ignores(relPathNorm)) {
              continue;
            }
            // Only include files matching the R\d+-*.md pattern or any .md in root
            if (entry.match(/^R\d+-.*\.md$/) || dir === docsPath) {
              files.push({
                path: fullPath,
                mtime: stat.mtimeMs,
              });
            }
          }
        }
      } catch (error) {
        // Ignore permission errors, continue scanning
      }
    };

    // Try legacy path first for backwards compatibility
    try {
      const legacyPath = join(docsPath, "mnt", "project");
      const stat = statSync(legacyPath);
      if (stat.isDirectory()) {
        scanDirectory(legacyPath);
      }
    } catch {
      // Legacy path doesn't exist, that's fine
    }

    // If no files found, scan from project root
    if (files.length === 0) {
      scanDirectory(docsPath);
    }

    // Sort by path for deterministic ordering
    files.sort((a, b) => a.path.localeCompare(b.path));

    // Hash all file paths and modification times
    for (const file of files) {
      hash.update(file.path);
      hash.update(file.mtime.toString());
    }

    // Include path as well for uniqueness across different doc roots
    hash.update(docsPath);

    return hash.digest("hex");
  }

  /**
   * Load .docignore patterns (gitignore-style)
   */
  private loadDocIgnore(docsPath: string): ignore.Ignore | null {
    try {
      const docIgnorePath = join(docsPath, ".docignore");
      if (!existsSync(docIgnorePath)) return null;
      const content = readFileSync(docIgnorePath, "utf-8");
      const ig = ignore();
      ig.add(content.split(/\r?\n/));
      return ig;
    } catch {
      return null;
    }
  }

  /**
   * Invalidate cache for a path
   */
  invalidate(docsPath: string): void {
    this.cache.delete(docsPath);
    console.error(`🗑️  Invalidated cache for: ${docsPath}`);
  }

  /**
   * Invalidate all caches
   */
  invalidateAll(): void {
    this.cache.clear();
    console.error("🗑️  Invalidated all caches");
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; paths: string[] } {
    return {
      size: this.cache.size,
      paths: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [path, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(path);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`🧹 Cleaned ${cleaned} expired cache entries`);
    }

    return cleaned;
  }
}

// Singleton instance
const indexManager = new DocIndexManager();

/**
 * Get doc index for a path (cached)
 */
export function getDocIndex(
  docsPath: string,
  options?: DocIndexOptions
): DocIndex {
  return indexManager.getIndex(docsPath, options);
}

/**
 * Invalidate cache for a path
 */
export function invalidateDocIndex(docsPath: string): void {
  indexManager.invalidate(docsPath);
}

/**
 * Invalidate all caches
 */
export function invalidateAllDocIndexes(): void {
  indexManager.invalidateAll();
}

/**
 * Get cache statistics
 */
export function getDocIndexStats(): { size: number; paths: string[] } {
  return indexManager.getStats();
}

/**
 * Clean expired cache entries
 */
export function cleanExpiredIndexes(): number {
  return indexManager.cleanExpired();
}

// Periodic cleanup
setInterval(() => {
  indexManager.cleanExpired();
}, 60 * 1000); // Every minute

