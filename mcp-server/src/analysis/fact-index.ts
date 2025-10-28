import { getDocIndex } from "../utils/doc-index.js";
import { extractFactsFromMarkdown } from "./fact-extractor.js";
import {
  computeFactKey,
  canonicalizeValue,
  Fact,
  FactDuplicate,
  FactConflict,
} from "./facts.js";

export interface FactIndexEntry {
  key: string; // normalized subject::predicate
  values: Map<string, Fact[]>; // canonical object value -> occurrences
}

export interface FactIndex {
  byKey: Map<string, FactIndexEntry>;
}

export function buildFactIndex(projectRoot: string): FactIndex {
  const { sections } = getDocIndex(projectRoot);
  const index: FactIndex = { byKey: new Map() };

  for (const section of sections) {
    const facts = extractFactsFromMarkdown(
      section.content,
      section.file,
      section.heading,
      section.lineStart
    );
    for (const fact of facts) {
      insertFact(index, fact);
    }
  }

  return index;
}

export function insertFact(index: FactIndex, fact: Fact): void {
  const key = computeFactKey(fact.subject, fact.predicate);
  let entry = index.byKey.get(key);
  if (!entry) {
    entry = { key, values: new Map() };
    index.byKey.set(key, entry);
  }
  const valueKey = canonicalizeValue(fact.object);
  const list = entry.values.get(valueKey) || [];
  list.push(fact);
  entry.values.set(valueKey, list);
}

export function findDuplicates(index: FactIndex, facts: Fact[]): FactDuplicate[] {
  const dups: FactDuplicate[] = [];
  for (const f of facts) {
    const key = computeFactKey(f.subject, f.predicate);
    const entry = index.byKey.get(key);
    if (!entry) continue;
    const valueKey = canonicalizeValue(f.object);
    const existingList = entry.values.get(valueKey);
    if (existingList && existingList.length > 0) {
      for (const existing of existingList) {
        dups.push({ existing, duplicate: f });
      }
    }
  }
  return dups;
}

export function findConflicts(index: FactIndex, facts: Fact[]): FactConflict[] {
  const conflicts: FactConflict[] = [];
  for (const f of facts) {
    const key = computeFactKey(f.subject, f.predicate);
    const entry = index.byKey.get(key);
    if (!entry) continue;
    const valueKey = canonicalizeValue(f.object);
    for (const [otherValue, existingList] of entry.values.entries()) {
      if (otherValue !== valueKey) {
        for (const existing of existingList) {
          conflicts.push({
            existing,
            conflicting: f,
            reason: `Different value for ${f.subject} ${f.predicate}: existing=${existing.object}, new=${f.object}`,
          });
        }
      }
    }
  }
  return conflicts;
}


