import { getDocIndex } from "../utils/doc-index.js";
import { semanticSearch } from "../utils/semantic-search.js";

export interface SearchDocsArgs {
  query: string;
  filters?: {
    release?: string;
    service?: string;
    docTypes?: string[];
  };
}

export interface SearchDocsResult {
  file: string;
  heading: string;
  lines: string;
  score: number;
  release: string;
  docType: string;
  snippet: string;
}

export async function searchDocs(
  projectRoot: string,
  args: SearchDocsArgs
): Promise<string> {
  const { sections } = getDocIndex(projectRoot);

  if (sections.length === 0) {
    return "⚠️ No documentation found. Ensure PROJECT_ROOT points to your documentation directory.";
  }

  const results = semanticSearch(sections, args.query, {
    release: args.filters?.release,
    service: args.filters?.service,
    docTypes: args.filters?.docTypes,
    maxResults: 10,
  });

  if (results.length === 0) {
    return `No relevant documentation found for query: "${args.query}"`;
  }

  let output = `# Search Results: ${args.query}\n\n`;
  output += `**Found:** ${results.length} relevant section(s)\n\n`;
  output += "---\n\n";

  for (const result of results) {
    const { section, score, matchReasons } = result;
    
    output += `## ${section.heading}\n`;
    output += `**File:** ${section.file}\n`;
    output += `**Release:** ${section.release}\n`;
    output += `**Doc Type:** ${section.docType}\n`;
    output += `**Lines:** ${section.lineStart}-${section.lineEnd}\n`;
    output += `**Score:** ${score.toFixed(2)}\n`;
    output += `**Match:** ${matchReasons.join(", ")}\n\n`;
    
    // Include snippet
    const snippet = section.content.length > 400 
      ? section.content.slice(0, 400) + "..."
      : section.content;
    output += snippet;
    output += "\n\n---\n\n";
  }

  return output;
}

