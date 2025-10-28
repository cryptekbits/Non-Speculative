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
    if (!args) {
      throw new Error("Missing arguments");
    }

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

