import { FactIndex, buildFactIndex } from "../analysis/fact-index.js";

const cache = new Map<string, { index: FactIndex; builtAt: number }>();

export function getFactIndex(projectRoot: string): FactIndex {
  const cached = cache.get(projectRoot);
  if (cached) return cached.index;
  const index = buildFactIndex(projectRoot);
  cache.set(projectRoot, { index, builtAt: Date.now() });
  return index;
}

export function invalidateFactIndex(projectRoot: string): void {
  cache.delete(projectRoot);
}


