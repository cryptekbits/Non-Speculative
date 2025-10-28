import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

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
  const projectDir = join(projectRoot, "mnt", "project");
  
  try {
    const entries = readdirSync(projectDir);
    for (const entry of entries) {
      const fullPath = join(projectDir, entry);
      if (statSync(fullPath).isFile() && entry.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Fallback to current directory
    try {
      const entries = readdirSync(projectRoot);
      for (const entry of entries) {
        const fullPath = join(projectRoot, entry);
        if (statSync(fullPath).isFile() && entry.endsWith(".md")) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      console.error("Could not find documentation files:", e);
    }
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

