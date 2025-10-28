import { createDocUpdateAgent, DocUpdateIntent } from "../rag/doc-update.js";

let updateAgent: any = null;

function getUpdateAgent(projectRoot: string): any {
  if (!updateAgent) {
    updateAgent = createDocUpdateAgent({
      docsPath: projectRoot,
      groqApiKey: process.env.GROQ_API_KEY,
    });
  }
  return updateAgent;
}

export async function suggestDocUpdate(
  projectRoot: string,
  intent: string,
  context?: string,
  targetFile?: string,
  targetRelease?: string
): Promise<string> {
  const agent = getUpdateAgent(projectRoot);

  const updateIntent: DocUpdateIntent = {
    intent,
    context,
    targetFile,
    targetRelease,
  };

  const suggestion = await agent.suggestUpdate(updateIntent);

  let output = `# Documentation Update Suggestion\n\n`;
  output += `**Action:** ${suggestion.action.toUpperCase()}\n`;
  output += `**Target:** ${suggestion.targetPath}\n`;
  output += `**Rationale:** ${suggestion.rationale}\n\n`;

  if (suggestion.citations.length > 0) {
    output += `**Related Docs:** ${suggestion.citations.join(", ")}\n\n`;
  }

  if (suggestion.duplicates && suggestion.duplicates.length > 0) {
    output += `### Potential Duplicates (${suggestion.duplicates.length})\n\n`;
    for (const d of suggestion.duplicates) {
      output += `- ${d.subject} → ${d.object} (${d.file}${d.heading ? ` • ${d.heading}` : ""}${d.lineStart ? ` • L${d.lineStart}` : ""})\n`;
    }
    output += `\n`;
  }

  if (suggestion.conflicts && suggestion.conflicts.length > 0) {
    output += `### Conflicts Detected (${suggestion.conflicts.length})\n\n`;
    for (const c of suggestion.conflicts) {
      output += `- ${c.subject}: existing=${c.existing}, incoming=${c.incoming} (${c.file}${c.heading ? ` • ${c.heading}` : ""}${c.lineStart ? ` • L${c.lineStart}` : ""})\n`;
    }
    output += `\n`;
    output += `⚠️ Apply is blocked by default when conflicts exist. Use force=true to override.\n\n`;
  }

  output += `---\n\n`;
  output += `## Proposed Changes\n\n`;
  output += "```diff\n";
  output += suggestion.diff;
  output += "\n```\n\n";

  output += `---\n\n`;
  output += `To apply this update, call \`apply_doc_update\` with the target path and diff. To bypass conflicts, include \`force: true\`.\n`;

  return output;
}

export async function applyDocUpdate(
  projectRoot: string,
  targetPath: string,
  diff: string,
  force?: boolean
): Promise<string> {
  const agent = getUpdateAgent(projectRoot);

  const result = await agent.applyUpdate(
    {
      action: targetPath.includes("NOTES") ? "create" : "update",
      targetPath,
      diff,
      rationale: "Applied via MCP tool",
      citations: [],
    },
    { force }
  );

  if (result.status === "error") {
    return `❌ **Error:** ${result.error}\n\nFailed to update: ${result.path}`;
  }

  let output = `✅ **Success**\n\n`;
  output += `**Updated:** ${result.path}\n`;
  output += `**Reindexed:** ${result.reindexed ? "Yes" : "No"}\n\n`;
  output += `The documentation has been updated and the index has been refreshed.\n`;

  return output;
}

