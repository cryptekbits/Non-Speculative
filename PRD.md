# D.Coder MCP Documentation Server

Complete code for a context-aware documentation server. Let's build this step by step.

## File Structure

```
~/dcoder-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── architecture-context.ts
│   │   ├── release-comparison.ts
│   │   ├── implementation-readiness.ts
│   │   └── service-dependencies.ts
│   └── utils/
│       ├── doc-parser.ts
│       └── semantic-search.ts
└── README.md
```

## 1. Package Configuration

**`package.json`**
```json
{
  "name": "dcoder-mcp-server",
  "version": "1.0.0",
  "description": "Context-aware documentation server for D.Coder project",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "prepare": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3"
  }
}
```

**`tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

## 2. Core Server

**`src/index.ts`**
```typescript
#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getArchitectureContext } from "./tools/architecture-context.js";
import { compareReleases } from "./tools/release-comparison.js";
import { verifyImplementationReadiness } from "./tools/implementation-readiness.js";
import { getServiceDependencies } from "./tools/service-dependencies.js";

// Parse command-line arguments for documentation path
function parseDocsPath(): string {
  const args = process.argv.slice(2);
  
  // Check for --docs-path=<path> format
  const docsPathArg = args.find(arg => arg.startsWith('--docs-path='));
  if (docsPathArg) {
    return docsPathArg.split('=')[1];
  }
  
  // Check for --docs-path <path> or -d <path> format
  const flagIndex = args.findIndex(arg => arg === '--docs-path' || arg === '-d');
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    return args[flagIndex + 1];
  }
  
  // Check for positional argument (first arg that doesn't start with -)
  const positionalArg = args.find(arg => !arg.startsWith('-'));
  if (positionalArg) {
    return positionalArg;
  }
  
  // Fall back to environment variable or current working directory
  return process.env.PROJECT_ROOT || process.cwd();
}

const PROJECT_ROOT = parseDocsPath();
console.error(`Documentation path: ${PROJECT_ROOT}`);

const server = new Server(
  {
    name: "dcoder-docs",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_architecture_context",
        description: "Search D.Coder architecture documentation for relevant context. Searches across all releases (R1-R4) and services. Returns only relevant sections to avoid context overload.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What you're looking for (e.g., 'authentication flow', 'semantic cache implementation', 'prompt encryption')",
            },
            release: {
              type: "string",
              description: "Optional: Filter by release (R1, R2, R3, R4)",
              enum: ["R1", "R2", "R3", "R4"],
            },
            service: {
              type: "string",
              description: "Optional: Filter by service name (e.g., 'prompt-gateway', 'tenant-mgmt')",
            },
            doc_types: {
              type: "array",
              items: {
                type: "string",
                enum: ["PRD", "ARCHITECTURE", "ARCHITECTURE_ADDENDUM", "SERVICE_CONTRACTS", "AGENT_ENGINEERING_BRIEF", "CONFIGURATION", "GUARDRAILS_AND_DLP", "PLUGIN_ARCHITECTURE", "COMPLIANCE_MAPPING", "MIGRATION_NOTES", "CHECKLIST"]
              },
              description: "Optional: Filter by document types",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "compare_releases",
        description: "Compare how a feature or service evolved across releases. Shows what changed and why.",
        inputSchema: {
          type: "object",
          properties: {
            feature: {
              type: "string",
              description: "Feature or service to compare (e.g., 'semantic-cache', 'authentication', 'prompt-gateway')",
            },
            releases: {
              type: "array",
              items: {
                type: "string",
                enum: ["R1", "R2", "R3", "R4"],
              },
              description: "Releases to compare (default: all releases where feature exists)",
            },
          },
          required: ["feature"],
        },
      },
      {
        name: "verify_implementation_readiness",
        description: "Pre-flight check before implementing a feature. Verifies dependencies, environment, services, and configuration.",
        inputSchema: {
          type: "object",
          properties: {
            subtask_id: {
              type: "string",
              description: "Optional: Linear subtask ID",
            },
            feature: {
              type: "string",
              description: "Feature or service to verify (e.g., 'semantic-cache', 'prompt-encryption')",
            },
            release: {
              type: "string",
              description: "Target release (R1, R2, R3, R4)",
              enum: ["R1", "R2", "R3", "R4"],
            },
          },
          required: ["feature", "release"],
        },
      },
      {
        name: "get_service_dependencies",
        description: "Map dependencies and relationships for a service. Shows which services it depends on and which depend on it.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "Service name (e.g., 'prompt-gateway', 'tenant-mgmt', 'iam')",
            },
            release: {
              type: "string",
              description: "Release version (R1, R2, R3, R4)",
              enum: ["R1", "R2", "R3", "R4"],
            },
            include_data_flow: {
              type: "boolean",
              description: "Include data flow information (default: false)",
              default: false,
            },
          },
          required: ["service", "release"],
        },
      },
    ],
  };
});

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_architecture_context": {
        const result = await getArchitectureContext(
          PROJECT_ROOT,
          args.query as string,
          args.release as string | undefined,
          args.service as string | undefined,
          args.doc_types as string[] | undefined
        );
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "compare_releases": {
        const result = await compareReleases(
          PROJECT_ROOT,
          args.feature as string,
          args.releases as string[] | undefined
        );
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "verify_implementation_readiness": {
        const result = await verifyImplementationReadiness(
          PROJECT_ROOT,
          args.feature as string,
          args.release as string,
          args.subtask_id as string | undefined
        );
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "get_service_dependencies": {
        const result = await getServiceDependencies(
          PROJECT_ROOT,
          args.service as string,
          args.release as string,
          args.include_data_flow as boolean | undefined
        );
        return {
          content: [{ type: "text", text: result }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("D.Coder MCP Documentation Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

## 3. Utility Functions

**`src/utils/doc-parser.ts`**
```typescript
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
```

**`src/utils/semantic-search.ts`**
```typescript
import { DocSection } from "./doc-parser.js";

export interface SearchResult {
  section: DocSection;
  score: number;
  matchReasons: string[];
}

export function semanticSearch(
  sections: DocSection[],
  query: string,
  options?: {
    release?: string;
    service?: string;
    docTypes?: string[];
    maxResults?: number;
  }
): SearchResult[] {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  let filtered = sections;

  // Apply filters
  if (options?.release) {
    filtered = filtered.filter((s) => s.release === options.release);
  }
  if (options?.service) {
    const serviceLower = options.service.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.heading.toLowerCase().includes(serviceLower) ||
        s.content.toLowerCase().includes(serviceLower)
    );
  }
  if (options?.docTypes && options.docTypes.length > 0) {
    filtered = filtered.filter((s) => options.docTypes!.includes(s.docType));
  }

  // Score each section
  const results: SearchResult[] = filtered.map((section) => {
    const { score, reasons } = scoreSection(section, queryLower, queryTerms);
    return { section, score, matchReasons: reasons };
  });

  // Sort by score and return top results
  results.sort((a, b) => b.score - a.score);
  const maxResults = options?.maxResults || 5;
  return results.slice(0, maxResults).filter((r) => r.score > 0);
}

function scoreSection(
  section: DocSection,
  queryLower: string,
  queryTerms: string[]
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const headingLower = section.heading.toLowerCase();
  const contentLower = section.content.toLowerCase();
  const combinedLower = `${headingLower} ${contentLower}`;

  // Exact phrase match in heading (highest priority)
  if (headingLower.includes(queryLower)) {
    score += 100;
    reasons.push("Exact match in heading");
  }

  // Exact phrase match in content
  if (contentLower.includes(queryLower)) {
    score += 50;
    reasons.push("Exact match in content");
  }

  // Term matches
  let termsInHeading = 0;
  let termsInContent = 0;

  for (const term of queryTerms) {
    if (headingLower.includes(term)) {
      termsInHeading++;
      score += 10;
    }
    if (contentLower.includes(term)) {
      termsInContent++;
      score += 5;
    }
  }

  if (termsInHeading > 0) {
    reasons.push(`${termsInHeading} term(s) in heading`);
  }
  if (termsInContent > 0) {
    reasons.push(`${termsInContent} term(s) in content`);
  }

  // Keyword bonuses
  const keywords = [
    "implementation",
    "architecture",
    "flow",
    "diagram",
    "example",
    "interface",
    "contract",
    "specification",
  ];

  for (const keyword of keywords) {
    if (queryLower.includes(keyword) && combinedLower.includes(keyword)) {
      score += 15;
      reasons.push(`Keyword match: ${keyword}`);
      break;
    }
  }

  return { score, reasons };
}
```

## 4. Tool Implementations

**`src/tools/architecture-context.ts`**
```typescript
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
```

**`src/tools/release-comparison.ts`**
```typescript
import { parseDocumentation } from "../utils/doc-parser.js";
import { semanticSearch } from "../utils/semantic-search.js";

export async function compareReleases(
  projectRoot: string,
  feature: string,
  releases?: string[]
): Promise<string> {
  const sections = parseDocumentation(projectRoot);
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
```

**`src/tools/implementation-readiness.ts`**
```typescript
import { parseDocumentation } from "../utils/doc-parser.js";
import { semanticSearch } from "../utils/semantic-search.js";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export async function verifyImplementationReadiness(
  projectRoot: string,
  feature: string,
  release: string,
  subtaskId?: string
): Promise<string> {
  let output = `# Implementation Readiness: ${feature} (${release})\n\n`;
  
  if (subtaskId) {
    output += `**Subtask:** ${subtaskId}\n\n`;
  }

  const checks: { name: string; status: string; details?: string }[] = [];

  // 1. Documentation check
  const sections = parseDocumentation(projectRoot);
  const docs = semanticSearch(sections, feature, { release, maxResults: 3 });
  
  checks.push({
    name: "Documentation",
    status: docs.length > 0 ? "✅ Found" : "❌ Not found",
    details: docs.length > 0 
      ? `Found ${docs.length} relevant section(s) in ${docs[0].section.file}`
      : "No architecture documentation found",
  });

  // 2. Service dependencies check
  const serviceDocs = semanticSearch(sections, feature, {
    release,
    docTypes: ["SERVICE_CONTRACTS", "ARCHITECTURE"],
    maxResults: 1,
  });

  if (serviceDocs.length > 0) {
    const content = serviceDocs[0].section.content;
    const dependencies = extractDependencies(content);
    
    checks.push({
      name: "Dependencies",
      status: dependencies.length > 0 ? "⚠️ Required" : "✅ None",
      details: dependencies.length > 0 
        ? `Requires: ${dependencies.join(", ")}`
        : undefined,
    });
  }

  // 3. Environment check
  try {
    const envFile = join(projectRoot, ".env");
    checks.push({
      name: "Environment",
      status: existsSync(envFile) ? "✅ .env exists" : "⚠️ .env missing",
    });
  } catch {
    checks.push({
      name: "Environment",
      status: "❓ Could not check",
    });
  }

  // 4. Git status
  try {
    const gitStatus = execSync("git status --porcelain", {
      cwd: projectRoot,
      encoding: "utf-8",
    });
    
    checks.push({
      name: "Git Status",
      status: gitStatus.trim() === "" ? "✅ Clean" : "⚠️ Uncommitted changes",
      details: gitStatus.trim() !== "" ? "Commit or stash changes before starting" : undefined,
    });
  } catch {
    checks.push({
      name: "Git Status",
      status: "❓ Not a git repository",
    });
  }

  // Output checklist
  output += "## Pre-flight Checklist\n\n";
  for (const check of checks) {
    output += `- **${check.name}:** ${check.status}\n`;
    if (check.details) {
      output += `  ${check.details}\n`;
    }
  }

  // Overall status
  const criticalFailures = checks.filter(c => c.status.startsWith("❌"));
  const warnings = checks.filter(c => c.status.startsWith("⚠️"));

  output += "\n## Status\n\n";
  if (criticalFailures.length > 0) {
    output += "❌ **NOT READY** - Address critical issues above\n";
  } else if (warnings.length > 0) {
    output += "⚠️ **READY WITH WARNINGS** - Review warnings before proceeding\n";
  } else {
    output += "✅ **READY** - All checks passed\n";
  }

  return output;
}

function extractDependencies(content: string): string[] {
  const deps: string[] = [];
  const patterns = [
    /depends on:?\s*([^\n]+)/gi,
    /requires?:?\s*([^\n]+)/gi,
    /integrates? with:?\s*([^\n]+)/gi,
  ];

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const items = match[1].split(/[,;]/).map(s => s.trim());
      deps.push(...items);
    }
  }

  return [...new Set(deps)].filter(d => d.length > 0 && d.length < 50);
}
```

**`src/tools/service-dependencies.ts`**
```typescript
import { parseDocumentation } from "../utils/doc-parser.js";
import { semanticSearch } from "../utils/semantic-search.js";

export async function getServiceDependencies(
  projectRoot: string,
  service: string,
  release: string,
  includeDataFlow: boolean = false
): Promise<string> {
  const sections = parseDocumentation(projectRoot);
  
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
```

## 5. Setup Instructions

**`README.md`**
```markdown
# D.Coder MCP Documentation Server

Context-aware documentation search for the D.Coder project.

## Installation

1. **Install dependencies:**
   ```bash
   cd ~/dcoder-mcp-server
   npm install
   ```

2. **Build the server:**
   ```bash
   npm run build
   ```

3. **Configure Claude Code:**
   
   Edit your Claude Code configuration file:
   ```bash
   # macOS/Linux
   code ~/.config/claude-code/mcp_config.json
   
   # Windows
   code %APPDATA%\claude-code\mcp_config.json
   ```

   Add the server configuration (using command-line arguments - recommended):
   ```json
   {
     "mcpServers": {
       "dcoder-docs": {
         "command": "node",
         "args": [
           "/FULL/PATH/TO/dcoder-mcp-server/build/index.js",
           "--docs-path",
           "/FULL/PATH/TO/your-dcoder-project"
         ]
       }
     }
   }
   ```
   
   Alternative (using environment variable - legacy):
   ```json
   {
     "mcpServers": {
       "dcoder-docs": {
         "command": "node",
         "args": ["/FULL/PATH/TO/dcoder-mcp-server/build/index.js"],
         "env": {
           "PROJECT_ROOT": "/FULL/PATH/TO/your-dcoder-project"
         }
       }
     }
   }
   ```

   **Important:** Replace with absolute paths! CLI arguments take precedence over environment variables.

4. **Restart Claude Code**

## Available Tools

### 1. `get_architecture_context`
Search documentation for relevant context.

**Example:**
```
Use get_architecture_context with query="semantic cache implementation" and release="R2"
```

### 2. `compare_releases`
Compare how features evolved across releases.

**Example:**
```
Use compare_releases with feature="authentication" and releases=["R1", "R2", "R3"]
```

### 3. `verify_implementation_readiness`
Pre-flight check before implementing.

**Example:**
```
Use verify_implementation_readiness with feature="prompt-encryption" and release="R2"
```

### 4. `get_service_dependencies`
Map service relationships.

**Example:**
```
Use get_service_dependencies with service="prompt-gateway" and release="R2"
```

## Troubleshooting

**Server not showing up in Claude Code:**
- Check paths are absolute (no `~` or relative paths)
- Verify `build/index.js` exists after running `npm run build`
- Check Claude Code logs: `~/.config/claude-code/logs/`

**No documentation found:**
- Verify `PROJECT_ROOT` points to correct location
- Ensure docs are in `$PROJECT_ROOT/mnt/project/*.md` format
- Try running: `ls $PROJECT_ROOT/mnt/project/R*.md`

**Development mode (auto-rebuild):**
```bash
npm run watch
```
```

## 6. Quick Start Commands

Run these commands in your terminal:

```bash
# 1. Create server directory
mkdir -p ~/dcoder-mcp-server/src/{tools,utils}
cd ~/dcoder-mcp-server

# 2. Create all files (copy contents from above)
# Use the code blocks above for each file

# 3. Install and build
npm install
npm run build

# 4. Configure Claude Code (edit with your actual paths)
# macOS/Linux:
cat > ~/.config/claude-code/mcp_config.json << 'EOF'
{
  "mcpServers": {
    "dcoder-docs": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/dcoder-mcp-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/dcoder/project"
      }
    }
  }
}
EOF

# 5. Test the server
node build/index.js
# Should output: "D.Coder MCP Documentation Server running on stdio"
# Press Ctrl+C to exit

# 6. Restart Claude Code
```

## Usage in Claude Code

Once configured, you can use these commands in your Claude Code conversations:

```
"Before implementing semantic cache, use get_architecture_context to find R2 documentation"

"Use verify_implementation_readiness for prompt-encryption in R2"

"Compare how authentication evolved from R1 to R3"

"Show me dependencies for the prompt-gateway service in R2"
```

The server will automatically search your docs and return only relevant sections, keeping context manageable.