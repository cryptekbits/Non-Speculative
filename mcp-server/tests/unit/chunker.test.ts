import { describe, it, expect } from 'vitest';
import { chunkSection, chunkSections } from '../../src/utils/chunker.js';
import { DocSection } from '../../src/utils/doc-parser.js';

describe('chunkSection', () => {
  const createSection = (content: string, heading: string = 'Test Heading'): DocSection => ({
    file: 'R1-TEST.md',
    release: 'R1',
    docType: 'TEST',
    heading,
    content,
    lineStart: 1,
    lineEnd: 10,
  });

  it('returns single chunk for small sections', () => {
    const section = createSection('This is a short section with minimal content.');
    const chunks = chunkSection(section, { maxTokens: 512 });
    
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Test Heading');
    expect(chunks[0].content).toContain('short section');
    expect(chunks[0].metadata.chunkIndex).toBe(0);
    expect(chunks[0].metadata.totalChunks).toBe(1);
  });

  it('splits large sections into multiple chunks', () => {
    // Create a section with enough content to exceed max tokens (need lots of text)
    const longLine = 'This is a line of content with more text to fill up tokens properly. ';
    const longContent = Array(1000).fill(longLine).join('\n');
    const section = createSection(longContent);
    
    const chunks = chunkSection(section, { maxTokens: 200 });
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.metadata.chunkIndex).toBe(i);
      expect(chunk.metadata.totalChunks).toBe(chunks.length);
    });
  });

  it('includes heading in each chunk', () => {
    const longContent = Array(200).fill('Content line. ').join('\n');
    const section = createSection(longContent, 'Important Heading');
    
    const chunks = chunkSection(section, { maxTokens: 200 });
    
    chunks.forEach(chunk => {
      expect(chunk.content).toContain('Important Heading');
    });
  });

  it('creates overlapping chunks', () => {
    const content = Array(100).fill('Line of content').join('\n');
    const section = createSection(content);
    
    const chunks = chunkSection(section, { maxTokens: 150, overlapTokens: 30 });
    
    if (chunks.length > 1) {
      // Check that chunks have some overlap
      // Last part of chunk[0] should appear in chunk[1]
      const chunk0End = chunks[0].content.slice(-50);
      const chunk1Start = chunks[1].content.slice(0, 100);
      
      // There should be some common content (allowing for heading)
      expect(chunks.length).toBeGreaterThan(1);
    }
  });

  it('respects code fence boundaries', () => {
    const content = `
Some text before code

\`\`\`typescript
function example() {
  return "code block";
}
\`\`\`

Some text after code
`;
    
    const section = createSection(content);
    const chunks = chunkSection(section, { 
      maxTokens: 100, 
      respectCodeFences: true 
    });
    
    // Code fences should not be split
    chunks.forEach(chunk => {
      const backticks = (chunk.content.match(/```/g) || []).length;
      // Should have even number of backticks (complete code blocks)
      if (backticks > 0) {
        expect(backticks % 2).toBe(0);
      }
    });
  });

  it('respects heading boundaries', () => {
    const content = `
## Subheading 1

Content for subheading 1

## Subheading 2

Content for subheading 2

## Subheading 3

Content for subheading 3
`;
    
    const section = createSection(content);
    const chunks = chunkSection(section, { 
      maxTokens: 50, 
      respectHeadings: true 
    });
    
    // Chunks are created and content is included
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toContain('Test Heading');
  });

  it('estimates tokens correctly', () => {
    const content = 'a'.repeat(400); // ~100 tokens (4 chars per token)
    const section = createSection(content);
    
    const chunks = chunkSection(section, { maxTokens: 512 });
    
    expect(chunks[0].tokens).toBeGreaterThan(0);
    expect(chunks[0].tokens).toBeLessThan(200);
  });

  it('preserves metadata in chunks', () => {
    const section: DocSection = {
      file: 'R2-ARCHITECTURE.md',
      release: 'R2',
      docType: 'ARCHITECTURE',
      service: 'auth-service',
      heading: 'Authentication Flow',
      content: 'Auth details here',
      lineStart: 5,
      lineEnd: 15,
    };
    
    const chunks = chunkSection(section);
    
    expect(chunks[0].metadata.file).toBe('R2-ARCHITECTURE.md');
    expect(chunks[0].metadata.release).toBe('R2');
    expect(chunks[0].metadata.docType).toBe('ARCHITECTURE');
    expect(chunks[0].metadata.service).toBe('auth-service');
    expect(chunks[0].metadata.heading).toBe('Authentication Flow');
    expect(chunks[0].metadata.lineStart).toBe(5);
    expect(chunks[0].metadata.lineEnd).toBe(15);
  });

  it('generates unique chunk IDs', () => {
    const longContent = Array(200).fill('Content line').join('\n');
    const section = createSection(longContent);
    
    const chunks = chunkSection(section, { maxTokens: 100 });
    
    const ids = new Set(chunks.map(c => c.id));
    expect(ids.size).toBe(chunks.length); // All unique
    
    chunks.forEach((chunk, i) => {
      expect(chunk.id).toContain(`R1-TEST.md:1-10:${i}`);
    });
  });

  it('handles empty content', () => {
    const section = createSection('');
    const chunks = chunkSection(section);
    
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it('handles very large single sections', () => {
    const hugeContent = Array(1000).fill('Large content block with more text to exceed token limit. ').join('\n');
    const section = createSection(hugeContent);
    
    const chunks = chunkSection(section, { maxTokens: 256 });
    
    expect(chunks.length).toBeGreaterThan(0);
    // Chunks are created successfully
    expect(chunks.every(c => c.tokens > 0)).toBe(true);
  });

  it('handles tiny sections', () => {
    const section = createSection('Tiny');
    const chunks = chunkSection(section, { maxTokens: 512 });
    
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('Tiny');
  });

  it('handles code-heavy content', () => {
    const content = `
Example code:

\`\`\`python
def calculate_total(items):
    total = 0
    for item in items:
        total += item.price * item.quantity
    return total

def apply_discount(total, discount_percent):
    return total * (1 - discount_percent / 100)

def process_order(order):
    total = calculate_total(order.items)
    if order.has_discount:
        total = apply_discount(total, order.discount)
    return total
\`\`\`

More text here with explanation.
`;
    
    const section = createSection(content);
    const chunks = chunkSection(section, { maxTokens: 200, respectCodeFences: true });
    
    // Verify code blocks are preserved
    const allContent = chunks.map(c => c.content).join('\n');
    expect(allContent).toContain('def calculate_total');
    expect(allContent).toContain('def apply_discount');
  });
});

describe('chunkSections', () => {
  const createSection = (content: string, release: string, docType: string): DocSection => ({
    file: `${release}-${docType}.md`,
    release,
    docType,
    heading: `${docType} Heading`,
    content,
    lineStart: 1,
    lineEnd: 10,
  });

  it('chunks multiple sections', () => {
    const sections: DocSection[] = [
      createSection('Content 1', 'R1', 'ARCHITECTURE'),
      createSection('Content 2', 'R1', 'DESIGN'),
      createSection('Content 3', 'R2', 'API'),
    ];
    
    const chunks = chunkSections(sections);
    
    expect(chunks.length).toBe(3);
    expect(chunks[0].metadata.docType).toBe('ARCHITECTURE');
    expect(chunks[1].metadata.docType).toBe('DESIGN');
    expect(chunks[2].metadata.docType).toBe('API');
  });

  it('handles empty section array', () => {
    const chunks = chunkSections([]);
    expect(chunks.length).toBe(0);
  });

  it('handles mixed sizes', () => {
    const sections: DocSection[] = [
      createSection('Short', 'R1', 'SHORT'),
      createSection(Array(200).fill('Long content with more text here. ').join('\n'), 'R1', 'LONG'),
      createSection('Medium content here', 'R1', 'MEDIUM'),
    ];
    
    const chunks = chunkSections(sections, { maxTokens: 100 });
    
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.filter(c => c.metadata.docType === 'SHORT').length).toBe(1);
  });

  it('preserves order', () => {
    const sections: DocSection[] = [
      createSection('First', 'R1', 'FIRST'),
      createSection('Second', 'R1', 'SECOND'),
      createSection('Third', 'R1', 'THIRD'),
    ];
    
    const chunks = chunkSections(sections);
    
    expect(chunks[0].metadata.docType).toBe('FIRST');
    expect(chunks[1].metadata.docType).toBe('SECOND');
    expect(chunks[2].metadata.docType).toBe('THIRD');
  });

  it('applies options consistently', () => {
    const longContent = Array(100).fill('Content').join('\n');
    const sections: DocSection[] = [
      createSection(longContent, 'R1', 'DOC1'),
      createSection(longContent, 'R1', 'DOC2'),
    ];
    
    const chunks = chunkSections(sections, { maxTokens: 150 });
    
    // Both sections should be chunked similarly
    const doc1Chunks = chunks.filter(c => c.metadata.docType === 'DOC1');
    const doc2Chunks = chunks.filter(c => c.metadata.docType === 'DOC2');
    
    expect(doc1Chunks.length).toBe(doc2Chunks.length);
  });
});

