import { getDocIndex } from "../utils/doc-index.js";
import { semanticSearch } from "../utils/semantic-search.js";

export async function getServiceDependencies(
  projectRoot: string,
  service: string,
  release: string,
  includeDataFlow: boolean = false
): Promise<string> {
  const { sections } = getDocIndex(projectRoot);
  
  let output = `# Service Dependencies: ${service} (${release})\n\n`;

  // Find service architecture docs
  const serviceResults = semanticSearch(sections, service, {
    release,
    docTypes: ["ARCHITECTURE", "SERVICE_CONTRACTS", "ARCHITECTURE_ADDENDUM"],
    maxResults: 5,
  });

  if (serviceResults.length === 0) {
    return output + `❌ No documentation found for service "${service}" in ${release}`;
  }

  // Extract dependencies from content
  const allContent = serviceResults.map(r => r.section.content).join("\n");
  
  const dependsOn = extractServiceReferences(allContent, "depends|requires|calls|uses");
  const dependedBy = findReverseDependencies(sections, service, release);

  output += "## Direct Dependencies\n";
  if (dependsOn.length > 0) {
    output += "This service depends on:\n";
    for (const dep of dependsOn) {
      output += `- **${dep}**\n`;
    }
  } else {
    output += "✅ No direct dependencies detected\n";
  }

  output += "\n## Reverse Dependencies\n";
  if (dependedBy.length > 0) {
    output += "These services depend on this service:\n";
    for (const dep of dependedBy) {
      output += `- **${dep}**\n`;
    }
  } else {
    output += "✅ No services depend on this service\n";
  }

  // Data flow analysis
  if (includeDataFlow) {
    output += "\n## Data Flow\n";
    const dataFlow = extractDataFlow(allContent);
    if (dataFlow.length > 0) {
      for (const flow of dataFlow) {
        output += `- ${flow}\n`;
      }
    } else {
      output += "❓ No explicit data flow information found\n";
    }
  }

  // Include relevant architecture sections
  output += "\n## Related Documentation\n";
  for (const result of serviceResults.slice(0, 2)) {
    output += `### ${result.section.heading}\n`;
    output += `**Source:** ${result.section.file}\n\n`;
    const preview = result.section.content.substring(0, 300);
    output += preview + (result.section.content.length > 300 ? "..." : "");
    output += "\n\n";
  }

  return output;
}

function extractServiceReferences(content: string, pattern: string): string[] {
  const services: Set<string> = new Set();
  
  // Common service name patterns
  const servicePatterns = [
    /(?:prompt|tenant|iam|semantic|plugin|audit|marketplace|analytics|guardrail)[\w-]*/gi,
    new RegExp(`(?:${pattern})\\s+(?:the\\s+)?([\\w-]+(?:\\s+service)?)`, "gi"),
  ];

  for (const regex of servicePatterns) {
    const matches = content.matchAll(regex);
    for (const match of matches) {
      let serviceName = match[1] || match[0];
      serviceName = serviceName.trim().toLowerCase();
      
      // Filter out noise
      if (serviceName.length > 3 && serviceName.length < 30) {
        services.add(serviceName);
      }
    }
  }

  return Array.from(services).sort();
}

function findReverseDependencies(
  sections: any[],
  targetService: string,
  release: string
): string[] {
  const dependents: Set<string> = new Set();
  const targetLower = targetService.toLowerCase();

  for (const section of sections) {
    if (section.release !== release) continue;
    
    const contentLower = section.content.toLowerCase();
    
    // Check if this section mentions the target service as a dependency
    if (
      contentLower.includes(targetLower) &&
      (contentLower.includes("depends") ||
        contentLower.includes("uses") ||
        contentLower.includes("calls") ||
        contentLower.includes("requires"))
    ) {
      // Try to extract the service name from the heading or file
      const serviceMatch = section.heading.match(/^(\w+[\w-]*)/i);
      if (serviceMatch && serviceMatch[1].toLowerCase() !== targetLower) {
        dependents.add(serviceMatch[1]);
      }
    }
  }

  return Array.from(dependents).sort();
}

function extractDataFlow(content: string): string[] {
  const flows: string[] = [];
  
  const flowPatterns = [
    /flows?\s+(?:from|to)\s+([^\n.]+)/gi,
    /data\s+(?:is\s+)?(?:sent|received|passed|stored)\s+([^\n.]+)/gi,
    /(?:sends|receives)\s+([^\n.]+)/gi,
  ];

  for (const pattern of flowPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const flow = match[0].trim();
      if (flow.length > 10 && flow.length < 150) {
        flows.push(flow);
      }
    }
  }

  return [...new Set(flows)];
}

