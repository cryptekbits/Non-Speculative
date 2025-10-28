import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, basename, relative } from "path";
import ignore from "ignore";

export interface DocSection {
  file: string;
  release: string;
  docType: string;
  service?: string;
  heading: string;
  content: string;
  lineStart: number;
  lineEnd: number;
}

export function parseDocumentation(projectRoot: string): DocSection[] {
  const sections: DocSection[] = [];
  const docFiles = findDocFiles(projectRoot);

  for (const file of docFiles) {
    const content = readFileSync(file, "utf-8");
    const parsed = parseDocFile(file, content);
    sections.push(...parsed);
  }

  return sections;
}

function findDocFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const ig = loadDocIgnore(projectRoot);
  
  /**
   * Recursively find all .md files
   */
  function scanDirectory(dir: string): void {
    try {
      const entries = readdirSync(dir);
      
      for (const entry of entries) {
        // Skip hidden dirs and common exclusions
        if (entry.startsWith('.') || 
            entry === 'node_modules' || 
            entry === 'build' ||
            entry === 'dist') {
          continue;
        }
        
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (stat.isFile() && entry.endsWith(".md")) {
          // Apply .docignore filtering (normalize path separators for cross-platform)
          const relPath = relative(projectRoot, fullPath);
          const relPathNorm = relPath.split('\\').join('/');
          if (ig && ig.ignores(relPathNorm)) {
            continue;
          }
          // Only include files matching the R\d+-*.md pattern or any .md in root
          if (entry.match(/^R\d+-.*\.md$/) || dir === projectRoot) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Ignore permission errors, continue scanning
    }
  }
  
  // Try legacy path first for backwards compatibility
  try {
    const legacyPath = join(projectRoot, "mnt", "project");
    const stat = statSync(legacyPath);
    if (stat.isDirectory()) {
      scanDirectory(legacyPath);
    }
  } catch {
    // Legacy path doesn't exist, that's fine
  }
  
  // If no files found, scan from project root
  if (files.length === 0) {
    scanDirectory(projectRoot);
  }

  return files;
}

function parseDocFile(file: string, content: string): DocSection[] {
  const sections: DocSection[] = [];
  const filename = basename(file);
  
  // Extract metadata from filename (e.g., "R2-ARCHITECTURE.md")
  const match = filename.match(/^(R\d+)-(.+)\.md$/);
  if (!match) return sections;

  const [, release, docType] = match;
  const lines = content.split("\n");
  
  let currentHeading = "";
  let currentContent: string[] = [];
  let currentLineStart = 0;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentHeading && currentContent.length > 0) {
        sections.push({
          file: filename,
          release,
          docType,
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
          lineStart: currentLineStart,
          lineEnd: i - 1,
        });
      }

      // Start new section
      headingLevel = headingMatch[1].length;
      currentHeading = headingMatch[2];
      currentContent = [];
      currentLineStart = i;
    } else if (currentHeading) {
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentHeading && currentContent.length > 0) {
    sections.push({
      file: filename,
      release,
      docType,
      heading: currentHeading,
      content: currentContent.join("\n").trim(),
      lineStart: currentLineStart,
      lineEnd: lines.length - 1,
    });
  }

  return sections;
}

function loadDocIgnore(projectRoot: string): ignore.Ignore | null {
  try {
    const p = join(projectRoot, ".docignore");
    if (!existsSync(p)) return null;
    const ig = ignore();
    ig.add(readFileSync(p, "utf-8").split(/\r?\n/));
    return ig;
  } catch {
    return null;
  }
}

