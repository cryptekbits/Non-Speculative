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

