import { getDocIndex } from "../utils/doc-index.js";
import { semanticSearch } from "../utils/semantic-search.js";

export async function compareReleases(
  projectRoot: string,
  feature: string,
  releases?: string[]
): Promise<string> {
  const { sections } = getDocIndex(projectRoot);
  const targetReleases = releases || ["R1", "R2", "R3", "R4"];

  let output = `# Release Comparison: ${feature}\n\n`;

  for (const release of targetReleases) {
    const results = semanticSearch(sections, feature, {
      release,
      maxResults: 3,
    });

    if (results.length === 0) {
      output += `## ${release}\n❌ Not found or not documented\n\n`;
      continue;
    }

    output += `## ${release}\n`;
    
    for (const result of results) {
      const { section } = result;
      output += `### ${section.heading}\n`;
      output += `**Doc:** ${section.docType}\n\n`;
      
      // Truncate long content for comparison view
      const preview =
        section.content.length > 500
          ? section.content.substring(0, 500) + "..."
          : section.content;
      
      output += preview;
      output += "\n\n";
    }

    output += "---\n\n";
  }

  return output;
}

