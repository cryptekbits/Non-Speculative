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

