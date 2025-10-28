import { parseDocumentation } from "../utils/doc-parser.js";
import { semanticSearch } from "../utils/semantic-search.js";

export async function getArchitectureContext(
  projectRoot: string,
  query: string,
  release?: string,
  service?: string,
  docTypes?: string[]
): Promise<string> {
  const sections = parseDocumentation(projectRoot);

  if (sections.length === 0) {
    return "⚠️ No documentation found. Ensure PROJECT_ROOT points to your D.Coder project.";
  }

  const results = semanticSearch(sections, query, {
    release,
    service,
    docTypes,
    maxResults: 5,
  });

  if (results.length === 0) {
    return `No relevant documentation found for query: "${query}"\n\nTry:\n- Broader search terms\n- Different release (${release || "any"})\n- Different document types`;
  }

  let output = `# Architecture Context: ${query}\n\n`;
  
  if (release) output += `**Release:** ${release}\n`;
  if (service) output += `**Service:** ${service}\n`;
  output += `**Found:** ${results.length} relevant section(s)\n\n`;
  output += "---\n\n";

  for (const result of results) {
    const { section, matchReasons } = result;
    
    output += `## ${section.heading}\n`;
    output += `**Source:** ${section.file} (${section.release})\n`;
    output += `**Match:** ${matchReasons.join(", ")}\n\n`;
    output += section.content;
    output += "\n\n---\n\n";
  }

  return output;
}

