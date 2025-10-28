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

  output += `---\n\n`;
  output += `## Proposed Changes\n\n`;
  output += "```diff\n";
  output += suggestion.diff;
  output += "\n```\n\n";

  output += `---\n\n`;
  output += `To apply this update, call \`apply_doc_update\` with the target path and diff.\n`;

  return output;
}

export async function applyDocUpdate(
  projectRoot: string,
  targetPath: string,
  diff: string
): Promise<string> {
  const agent = getUpdateAgent(projectRoot);

  const result = await agent.applyUpdate({
    action: targetPath.includes("NOTES") ? "create" : "update",
    targetPath,
    diff,
    rationale: "Applied via MCP tool",
    citations: [],
  });

  if (result.status === "error") {
    return `❌ **Error:** ${result.error}\n\nFailed to update: ${result.path}`;
  }

  let output = `✅ **Success**\n\n`;
  output += `**Updated:** ${result.path}\n`;
  output += `**Reindexed:** ${result.reindexed ? "Yes" : "No"}\n\n`;
  output += `The documentation has been updated and the index has been refreshed.\n`;

  return output;
}

