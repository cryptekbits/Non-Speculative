import { describe, it, expect } from 'vitest';
import { semanticSearch } from '../../src/utils/semantic-search.js';

describe('semanticSearch', () => {
  const sections = [
    { file: 'R1-ARCHITECTURE.md', release: 'R1', docType: 'ARCHITECTURE', heading: 'Auth service overview', content: 'authentication flow and tokens', lineStart: 1, lineEnd: 10 },
    { file: 'R2-ARCHITECTURE.md', release: 'R2', docType: 'ARCHITECTURE', heading: 'Payments', content: 'handle invoices', lineStart: 1, lineEnd: 10 },
  ];

  it('scores sections and returns results', () => {
    const results = semanticSearch(sections as any, 'authentication flow', { maxResults: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].section.heading.toLowerCase()).toContain('auth');
  });

  it('applies release filter', () => {
    const results = semanticSearch(sections as any, 'payments', { release: 'R2' });
    expect(results.length).toBe(1);
    expect(results[0].section.release).toBe('R2');
  });
});


