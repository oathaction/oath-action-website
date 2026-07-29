import type { LocatorType, SourceStatus } from "@/lib/domain/types";
import type { SegmentInput } from "@/lib/documents/segment";
import type { ExtractedCitation } from "./schemas";

/**
 * Citation resolution — the mechanism that makes fabricated sources impossible.
 *
 * Two invariants:
 *
 *  1. A locator is NEVER taken from the model. It is read from the stored
 *     segment the excerpt was actually found in. If the model says "page 7" but
 *     its quote lives on page 3, the citation says page 3. If the quote exists
 *     nowhere in the document, the citation gets no locator at all and the
 *     obligation is flagged "source confirmation needed".
 *
 *  2. Every excerpt is matched back against stored segment text. Exact matches
 *     score 1; near matches are scored by shingle overlap so ordinary
 *     whitespace and typography differences do not punish an honest quotation.
 */

export const VERIFIED_THRESHOLD = 0.85;
export const PARTIAL_THRESHOLD = 0.5;

export interface ResolvedCitation {
  segmentId: string | null;
  locatorType: LocatorType;
  locatorValue: string;
  excerpt: string;
  startOffset: number | null;
  endOffset: number | null;
  matchScore: number;
}

export interface CitationResolution {
  citations: ResolvedCitation[];
  sourceStatus: SourceStatus;
  bestScore: number;
}

/**
 * Normalises text for comparison while keeping a map back to original offsets,
 * so a match can still be highlighted in the untouched source text.
 */
export function normaliseWithMap(text: string): { normalised: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // trims leading whitespace

  for (let i = 0; i < text.length; i += 1) {
    let char = text[i];

    // Unify typography that differs between a PDF and a model's transcription.
    if (char === "’" || char === "‘" || char === "ʼ") char = "'";
    else if (char === "“" || char === "”") char = '"';
    else if (char === "–" || char === "—" || char === "−") char = "-";
    else if (char === " " || char === " " || char === " ") char = " ";
    else if (char === "­") continue; // soft hyphen

    if (/\s/.test(char)) {
      if (lastWasSpace) continue;
      out.push(" ");
      map.push(i);
      lastWasSpace = true;
      continue;
    }

    out.push(char.toLowerCase());
    map.push(i);
    lastWasSpace = false;
  }

  while (out.length > 0 && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }

  return { normalised: out.join(""), map };
}

function shingles(tokens: string[], size: number): Set<string> {
  const result = new Set<string>();
  if (tokens.length < size) {
    if (tokens.length > 0) result.add(tokens.join(" "));
    return result;
  }
  for (let i = 0; i <= tokens.length - size; i += 1) {
    result.add(tokens.slice(i, i + size).join(" "));
  }
  return result;
}

export interface ExcerptMatch {
  score: number;
  startOffset: number | null;
  endOffset: number | null;
}

/**
 * Scores how well an excerpt is supported by a segment's text.
 * Returns 1 with exact offsets for a verbatim quotation.
 */
export function matchExcerpt(excerpt: string, segmentText: string): ExcerptMatch {
  const needle = normaliseWithMap(excerpt);
  const haystack = normaliseWithMap(segmentText);

  if (needle.normalised.length === 0) return { score: 0, startOffset: null, endOffset: null };

  const index = haystack.normalised.indexOf(needle.normalised);
  if (index !== -1) {
    const start = haystack.map[index] ?? null;
    const endIndex = index + needle.normalised.length - 1;
    const end = haystack.map[endIndex] !== undefined ? haystack.map[endIndex] + 1 : null;
    return { score: 1, startOffset: start, endOffset: end };
  }

  // Not verbatim — measure how much of the quotation genuinely appears.
  const needleTokens = needle.normalised.split(" ").filter(Boolean);
  const haystackTokens = haystack.normalised.split(" ").filter(Boolean);
  if (needleTokens.length === 0 || haystackTokens.length === 0) {
    return { score: 0, startOffset: null, endOffset: null };
  }

  const size = needleTokens.length >= 5 ? 3 : 2;
  const needleShingles = shingles(needleTokens, size);
  const haystackShingles = shingles(haystackTokens, size);
  if (needleShingles.size === 0) return { score: 0, startOffset: null, endOffset: null };

  let hits = 0;
  for (const shingle of needleShingles) {
    if (haystackShingles.has(shingle)) hits += 1;
  }
  const score = hits / needleShingles.size;

  // Anchor the highlight on the longest run of the quote we can find.
  let startOffset: number | null = null;
  let endOffset: number | null = null;
  if (score > 0) {
    for (let length = Math.min(needleTokens.length, 12); length >= 3; length -= 1) {
      const probe = needleTokens.slice(0, length).join(" ");
      const at = haystack.normalised.indexOf(probe);
      if (at !== -1) {
        startOffset = haystack.map[at] ?? null;
        const endIdx = at + probe.length - 1;
        endOffset = haystack.map[endIdx] !== undefined ? haystack.map[endIdx] + 1 : null;
        break;
      }
    }
  }

  return { score, startOffset, endOffset };
}

/**
 * Resolves model-produced citations against the stored segments.
 *
 * The declared segmentId is only a hint. We verify the quote against that
 * segment first, and if it does not match we search every segment — a correct
 * quote with the wrong id is recoverable, a quote that exists nowhere is not.
 */
export function resolveCitations(
  citations: ExtractedCitation[],
  segments: SegmentInput[],
): CitationResolution {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const resolved: ResolvedCitation[] = [];

  for (const citation of citations) {
    const declared = byId.get(citation.segmentId);
    let best: { segment: SegmentInput; match: ExcerptMatch } | null = null;

    if (declared) {
      const match = matchExcerpt(citation.excerpt, declared.text);
      if (match.score >= VERIFIED_THRESHOLD) best = { segment: declared, match };
    }

    if (!best) {
      for (const segment of segments) {
        const match = matchExcerpt(citation.excerpt, segment.text);
        if (!best || match.score > best.match.score) best = { segment, match };
        if (match.score === 1) break;
      }
    }

    if (!best || best.match.score < PARTIAL_THRESHOLD) {
      // The quote is not in this document. Keep the claim visible but refuse to
      // attach a source locator to it.
      resolved.push({
        segmentId: null,
        locatorType: declared?.locatorType ?? "paragraph",
        locatorValue: "",
        excerpt: citation.excerpt,
        startOffset: null,
        endOffset: null,
        matchScore: best?.match.score ?? 0,
      });
      continue;
    }

    resolved.push({
      segmentId: best.segment.id,
      // Locator always comes from the stored segment, never from the model.
      locatorType: best.segment.locatorType,
      locatorValue: best.segment.locatorValue,
      excerpt: citation.excerpt,
      startOffset: best.match.startOffset,
      endOffset: best.match.endOffset,
      matchScore: Number(best.match.score.toFixed(3)),
    });
  }

  const usable = resolved.filter((citation) => citation.segmentId !== null);
  const bestScore = usable.reduce((max, citation) => Math.max(max, citation.matchScore), 0);

  let sourceStatus: SourceStatus = "unverified";
  if (bestScore >= VERIFIED_THRESHOLD) sourceStatus = "verified";
  else if (bestScore >= PARTIAL_THRESHOLD) sourceStatus = "partial";

  return { citations: resolved, sourceStatus, bestScore };
}

export interface CitationCoverage {
  total: number;
  verified: number;
  partial: number;
  unverified: number;
  /** Share of obligations whose evidence was found verbatim in the document. */
  coverage: number;
}

export function summariseCoverage(statuses: SourceStatus[]): CitationCoverage {
  const total = statuses.length;
  const verified = statuses.filter((status) => status === "verified").length;
  const partial = statuses.filter((status) => status === "partial").length;
  const unverified = statuses.filter((status) => status === "unverified").length;
  return {
    total,
    verified,
    partial,
    unverified,
    coverage: total === 0 ? 0 : Number((verified / total).toFixed(3)),
  };
}
