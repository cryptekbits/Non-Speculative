import { createFact, Fact, normalizeText } from "./facts.js";

/**
 * Extremely lightweight heuristic extractor.
 * Supports lines like:
 * - Subject: Value
 * - Subject - Value
 * - Subject = Value
 * Also extracts inline key facts in tables and bullet lists when formatted similarly.
 */
export function extractFactsFromMarkdown(
  content: string,
  file: string,
  heading?: string,
  lineOffset: number = 1
): Fact[] {
  const facts: Fact[] = [];
  const lines = content.split(/\r?\n/);
  const pattern = /^(?<subject>[^:#=\-\n][^:#=\-]{0,200})\s*(?:\:|\-|=)\s*(?<object>.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("<!--")) continue;

    const m = line.match(pattern);
    if (m && m.groups) {
      const subject = m.groups.subject.trim();
      const object = m.groups.object.trim();
      if (subject && object) {
        facts.push(
          createFact({
            subject,
            predicate: "is",
            object,
            file,
            heading,
            lineStart: lineOffset + i,
            lineEnd: lineOffset + i,
          })
        );
      }
    }
  }

  return facts;
}

/**
 * Extract facts from a proposed diff payload. For now, treat diff as plain content.
 */
export function extractFactsFromDiff(
  diffContent: string,
  file: string
): Fact[] {
  // Strip unified diff prefixes if present
  const cleaned = diffContent
    .split(/\r?\n/)
    .map((l) => (l.startsWith("+") || l.startsWith(" ") ? l.slice(1) : l))
    .join("\n");
  return extractFactsFromMarkdown(cleaned, file);
}


