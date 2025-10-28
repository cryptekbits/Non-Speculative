import crypto from "crypto";

export interface Fact {
  subject: string;
  predicate: string;
  object: string;
  file: string;
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
  normalized: string;
  hash: string;
}

export interface FactDuplicate {
  existing: Fact;
  duplicate: Fact;
}

export interface FactConflict {
  existing: Fact;
  conflicting: Fact;
  reason: string;
}

export function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\r\n|\r/g, "\n")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function canonicalizeValue(value: string): string {
  const trimmed = value.trim();
  // Normalize numbers and booleans if possible
  const num = Number(trimmed.replace(/[,\s]/g, ""));
  if (!isNaN(num)) return String(num);
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase();
  return normalizeText(trimmed);
}

export function computeFactKey(subject: string, predicate: string): string {
  return `${normalizeText(subject)}::${normalizeText(predicate)}`;
}

export function computeFactHashFromParts(
  subject: string,
  predicate: string,
  object: string
): string {
  const normalized = `${normalizeText(subject)}|${normalizeText(
    predicate
  )}|${canonicalizeValue(object)}`;
  return crypto.createHash("sha1").update(normalized).digest("hex");
}

export function createFact(params: {
  subject: string;
  predicate: string;
  object: string;
  file: string;
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
}): Fact {
  const normalized = `${normalizeText(params.subject)}|${normalizeText(
    params.predicate
  )}|${canonicalizeValue(params.object)}`;
  const hash = crypto.createHash("sha1").update(normalized).digest("hex");
  return {
    subject: params.subject.trim(),
    predicate: params.predicate.trim(),
    object: params.object.trim(),
    file: params.file,
    heading: params.heading,
    lineStart: params.lineStart,
    lineEnd: params.lineEnd,
    normalized,
    hash,
  };
}


