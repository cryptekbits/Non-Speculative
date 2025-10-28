/**
 * Agentic Documentation Update System
 * Decides whether to update existing docs or create new ones
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { invalidateDocIndex } from "../utils/doc-index.js";
import { EventEmitter } from "events";
import { getFactIndex, invalidateFactIndex } from "../utils/fact-index-cache.js";
import { extractFactsFromDiff } from "../analysis/fact-extractor.js";
import { findConflicts, findDuplicates } from "../analysis/fact-index.js";

export interface DocUpdateIntent {
  intent: string;
  context?: string;
  targetFile?: string;
  targetRelease?: string;
}

export interface DocUpdateSuggestion {
  action: "update" | "create";
  targetPath: string;
  diff: string;
  rationale: string;
  citations: string[];
  duplicates?: { file: string; heading?: string; lineStart?: number; object: string; subject: string }[];
  conflicts?: { file: string; heading?: string; lineStart?: number; existing: string; incoming: string; subject: string }[];
  blocked?: boolean;
}

export interface DocUpdateResult {
  status: "success" | "error";
  path: string;
  reindexed: boolean;
  error?: string;
}

export interface DocUpdateConfig {
  groqApiKey?: string;
  groqModel?: string;
  docsPath: string;
}

const UPDATE_DECISION_PROMPT = `You are a documentation architect. Given an intent to document something, decide whether to:
1. UPDATE an existing document (if relevant content exists)
2. CREATE a new document (if no suitable document exists)

Provide your decision as JSON:
{
  "action": "update" | "create",
  "targetPath": "path/to/file.md",
  "rationale": "Why this decision was made",
  "citations": ["existing sections that relate to this"]
}

Be conservative: prefer updating existing docs unless the topic is truly novel.`;

export class DocUpdateAgent extends EventEmitter {
  private config: DocUpdateConfig;
  private groq: any;

  constructor(config: DocUpdateConfig) {
    super();
    this.config = config;

    if (process.env.GROQ_API_KEY || config.groqApiKey) {
      this.groq = createGroq({
        apiKey: config.groqApiKey || process.env.GROQ_API_KEY,
      });
    }
  }

  /**
   * Suggest a documentation update
   */
  async suggestUpdate(
    intent: DocUpdateIntent
  ): Promise<DocUpdateSuggestion> {
    // For now, use simple heuristics
    // In production, use Groq to make intelligent decisions
    
    const targetFile = intent.targetFile || this.inferTargetFile(intent);
    const targetPath = join(this.config.docsPath, targetFile);
    const exists = existsSync(targetPath);

    const action: "update" | "create" = exists ? "update" : "create";

    let diff: string;
    if (action === "update") {
      diff = this.generateUpdateDiff(targetPath, intent);
    } else {
      diff = this.generateNewDocContent(intent);
    }

    // Analyze proposed diff for duplicates/conflicts
    const proposedFacts = extractFactsFromDiff(diff, targetPath);
    let duplicates: DocUpdateSuggestion["duplicates"] = [];
    let conflicts: DocUpdateSuggestion["conflicts"] = [];
    try {
      const index = getFactIndex(this.config.docsPath);
      const dups = findDuplicates(index, proposedFacts);
      const cons = findConflicts(index, proposedFacts);
      duplicates = dups.map(d => ({
        file: d.existing.file,
        heading: d.existing.heading,
        lineStart: d.existing.lineStart,
        object: d.existing.object,
        subject: d.existing.subject,
      }));
      conflicts = cons.map(c => ({
        file: c.existing.file,
        heading: c.existing.heading,
        lineStart: c.existing.lineStart,
        existing: c.existing.object,
        incoming: c.conflicting.object,
        subject: c.existing.subject,
      }));
    } catch {}

    return {
      action,
      targetPath,
      diff,
      rationale: exists
        ? `Document ${targetFile} already exists and covers related topics`
        : `No existing document found for this topic, creating new one`,
      citations: exists ? [targetFile] : [],
      duplicates,
      conflicts,
      blocked: (conflicts && conflicts.length > 0) || false,
    };
  }

  /**
   * Apply a documentation update
   */
  async applyUpdate(
    suggestion: DocUpdateSuggestion,
    options?: { force?: boolean }
  ): Promise<DocUpdateResult> {
    try {
      const { targetPath, diff, action } = suggestion;

      // Preflight: block on conflicts unless force
      try {
        const proposedFacts = extractFactsFromDiff(diff, targetPath);
        const index = getFactIndex(this.config.docsPath);
        const conflicts = findConflicts(index, proposedFacts);
        if (conflicts.length > 0 && !(options && options.force)) {
          return {
            status: "error",
            path: targetPath,
            reindexed: false,
            error: `Conflicting facts detected (${conflicts.length}). Use force=true to override.`,
          };
        }
      } catch {}

      if (action === "create") {
        // Create new file
        const dir = dirname(targetPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(targetPath, diff, "utf-8");
        this.emit("doc_created", targetPath);
      } else {
        // Update existing file
        // For simplicity, append to file
        // In production, apply actual diff patch
        const existing = readFileSync(targetPath, "utf-8");
        const updated = this.applyDiff(existing, diff);
        writeFileSync(targetPath, updated, "utf-8");
        this.emit("doc_updated", targetPath);
      }

      // Invalidate caches
      invalidateDocIndex(this.config.docsPath);
      this.emit("reindex_triggered", targetPath);
      try { invalidateFactIndex(this.config.docsPath); } catch {}

      return {
        status: "success",
        path: targetPath,
        reindexed: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("❌ Failed to apply doc update:", errorMsg);

      return {
        status: "error",
        path: suggestion.targetPath,
        reindexed: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Infer target file from intent
   */
  private inferTargetFile(intent: DocUpdateIntent): string {
    // Simple inference based on keywords
    const intentLower = intent.intent.toLowerCase();

    if (intentLower.includes("architecture")) {
      return `${intent.targetRelease || "R1"}-ARCHITECTURE.md`;
    } else if (intentLower.includes("service")) {
      return `${intent.targetRelease || "R1"}-SERVICE_CONTRACTS.md`;
    } else if (intentLower.includes("config")) {
      return `${intent.targetRelease || "R1"}-CONFIGURATION.md`;
    } else if (intentLower.includes("migration")) {
      return `${intent.targetRelease || "R1"}-MIGRATION_NOTES.md`;
    } else {
      return `${intent.targetRelease || "R1"}-NOTES.md`;
    }
  }

  /**
   * Generate update diff for existing document
   */
  private generateUpdateDiff(
    targetPath: string,
    intent: DocUpdateIntent
  ): string {
    // Simple append strategy
    // In production, use LLM to generate contextual patch

    const timestamp = new Date().toISOString();
    
    return `\n\n## Update: ${intent.intent}\n\n` +
           `**Added:** ${timestamp}\n\n` +
           `${intent.context || ""}\n`;
  }

  /**
   * Generate content for new document
   */
  private generateNewDocContent(intent: DocUpdateIntent): string {
    const timestamp = new Date().toISOString();
    
    return `# ${intent.intent}\n\n` +
           `**Created:** ${timestamp}\n\n` +
           `${intent.context || ""}\n`;
  }

  /**
   * Apply diff to existing content
   */
  private applyDiff(existing: string, diff: string): string {
    // Simple append for now
    // In production, parse unified diff and apply patches
    return existing + "\n" + diff;
  }
}

/**
 * Create doc update agent
 */
export function createDocUpdateAgent(
  config: DocUpdateConfig
): DocUpdateAgent {
  return new DocUpdateAgent(config);
}

