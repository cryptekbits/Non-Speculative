import { DocSection } from "./doc-parser.js";

export interface Chunk {
  id: string;
  content: string;
  metadata: {
    file: string;
    release: string;
    docType: string;
    service?: string;
    heading: string;
    lineStart: number;
    lineEnd: number;
    chunkIndex: number;
    totalChunks: number;
  };
  tokens: number;
}

export interface ChunkerOptions {
  maxTokens?: number;
  overlapTokens?: number;
  respectHeadings?: boolean;
  respectCodeFences?: boolean;
}

const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxTokens: 512,
  overlapTokens: 50,
  respectHeadings: true,
  respectCodeFences: true,
};

/**
 * Simple token estimator (roughly 4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk a single DocSection into smaller pieces for embedding
 */
export function chunkSection(
  section: DocSection,
  options?: ChunkerOptions
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  // If section is small enough, return as single chunk
  const totalTokens = estimateTokens(section.content);
  if (totalTokens <= opts.maxTokens) {
    chunks.push({
      id: `${section.file}:${section.lineStart}-${section.lineEnd}:0`,
      content: `${section.heading}\n\n${section.content}`,
      metadata: {
        file: section.file,
        release: section.release,
        docType: section.docType,
        service: section.service,
        heading: section.heading,
        lineStart: section.lineStart,
        lineEnd: section.lineEnd,
        chunkIndex: 0,
        totalChunks: 1,
      },
      tokens: totalTokens,
    });
    return chunks;
  }

  // Split content respecting markdown structure
  const segments = splitMarkdown(section.content, opts);
  
  // Combine segments into chunks with overlap
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;
  const headingTokens = estimateTokens(section.heading);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentTokens = estimateTokens(segment);

    // If adding this segment exceeds max, finalize current chunk
    if (
      currentTokens + segmentTokens > opts.maxTokens &&
      currentChunk.length > 0
    ) {
      const chunkContent = `${section.heading}\n\n${currentChunk.join("\n")}`;
      chunks.push({
        id: `${section.file}:${section.lineStart}-${section.lineEnd}:${chunkIndex}`,
        content: chunkContent,
        metadata: {
          file: section.file,
          release: section.release,
          docType: section.docType,
          service: section.service,
          heading: section.heading,
          lineStart: section.lineStart,
          lineEnd: section.lineEnd,
          chunkIndex,
          totalChunks: 0, // Will update at the end
        },
        tokens: currentTokens + headingTokens,
      });

      chunkIndex++;

      // Start new chunk with overlap
      const overlapSegments = getOverlapSegments(
        currentChunk,
        opts.overlapTokens
      );
      currentChunk = overlapSegments;
      currentTokens = estimateTokens(currentChunk.join("\n"));
    }

    currentChunk.push(segment);
    currentTokens += segmentTokens;
  }

  // Add final chunk if any content remains
  if (currentChunk.length > 0) {
    const chunkContent = `${section.heading}\n\n${currentChunk.join("\n")}`;
    chunks.push({
      id: `${section.file}:${section.lineStart}-${section.lineEnd}:${chunkIndex}`,
      content: chunkContent,
      metadata: {
        file: section.file,
        release: section.release,
        docType: section.docType,
        service: section.service,
        heading: section.heading,
        lineStart: section.lineStart,
        lineEnd: section.lineEnd,
        chunkIndex,
        totalChunks: 0,
      },
      tokens: currentTokens + headingTokens,
    });
  }

  // Update totalChunks
  const totalChunks = chunks.length;
  chunks.forEach((c) => (c.metadata.totalChunks = totalChunks));

  return chunks;
}

/**
 * Split markdown content into segments respecting structure
 */
function splitMarkdown(content: string, opts: Required<ChunkerOptions>): string[] {
  const segments: string[] = [];
  const lines = content.split("\n");
  let currentSegment: string[] = [];
  let inCodeFence = false;
  let codeFenceStart: string[] = [];

  for (const line of lines) {
    // Track code fences
    if (line.trim().startsWith("```")) {
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceStart = currentSegment.length > 0 ? [...currentSegment] : [];
        currentSegment.push(line);
      } else {
        // End of code fence
        inCodeFence = false;
        currentSegment.push(line);
        
        // Finalize code block as a segment if respecting code fences
        if (opts.respectCodeFences) {
          segments.push(currentSegment.join("\n"));
          currentSegment = [];
        }
      }
      continue;
    }

    // If in code fence, keep adding lines
    if (inCodeFence) {
      currentSegment.push(line);
      continue;
    }

    // Check for markdown headings
    const isHeading = opts.respectHeadings && /^#{1,6}\s+/.test(line);
    
    if (isHeading && currentSegment.length > 0) {
      // Finalize current segment before heading
      segments.push(currentSegment.join("\n"));
      currentSegment = [line];
    } else {
      currentSegment.push(line);
    }

    // Also split on blank lines for paragraph boundaries
    if (line.trim() === "" && currentSegment.length > 10) {
      segments.push(currentSegment.join("\n"));
      currentSegment = [];
    }
  }

  // Add final segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join("\n"));
  }

  return segments.filter((s) => s.trim().length > 0);
}

/**
 * Get overlap segments from the end of previous chunk
 */
function getOverlapSegments(segments: string[], targetTokens: number): string[] {
  const overlap: string[] = [];
  let tokens = 0;

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    const segmentTokens = estimateTokens(segment);

    if (tokens + segmentTokens > targetTokens) break;

    overlap.unshift(segment);
    tokens += segmentTokens;
  }

  return overlap;
}

/**
 * Chunk all sections from a document set
 */
export function chunkSections(
  sections: DocSection[],
  options?: ChunkerOptions
): Chunk[] {
  const allChunks: Chunk[] = [];

  for (const section of sections) {
    const chunks = chunkSection(section, options);
    allChunks.push(...chunks);
  }

  return allChunks;
}

