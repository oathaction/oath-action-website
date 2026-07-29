import type { LocatorType } from "@/lib/domain/types";
import type { ParsedBlock } from "./parse";

export interface SegmentInput {
  /** Deterministic, human-meaningful id such as `s3` — referenced by citations. */
  id: string;
  locatorType: LocatorType;
  locatorValue: string;
  heading: string | null;
  text: string;
  sequence: number;
  tokenEstimate: number;
}

export interface SegmentOptions {
  /** Upper bound on segment size in characters. */
  maxChars?: number;
  /** Segments smaller than this are merged forward when locators allow. */
  minChars?: number;
  /** Characters of trailing context repeated into the next segment of a split block. */
  overlapChars?: number;
}

const DEFAULTS = { maxChars: 2600, minChars: 500, overlapChars: 180 } as const;

/** Rough token estimate. Good enough for budgeting; never used for billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text at sentence or line boundaries so a segment never ends mid-clause,
 * which would make an excerpt un-matchable against its source.
 */
function splitLongText(text: string, maxChars: number, overlapChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    // Prefer a paragraph break, then a sentence end, then a space.
    const candidates = [
      window.lastIndexOf("\n\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf(";\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(" "),
    ].filter((index) => index > maxChars * 0.5);

    const cut = candidates.length > 0 ? Math.max(...candidates) + 1 : maxChars;
    parts.push(remaining.slice(0, cut).trim());
    const overlapStart = Math.max(0, cut - overlapChars);
    remaining = remaining.slice(overlapStart).trimStart();
  }

  if (remaining.trim()) parts.push(remaining.trim());
  return parts.filter(Boolean);
}

function rangeLabel(first: string, last: string): string {
  return first === last ? first : `${first}–${last}`;
}

/**
 * Turns parsed blocks into retrieval-sized segments while preserving an exact,
 * honest source locator for every one.
 *
 * Page blocks are never merged with one another: a citation that says "page 7"
 * must mean page 7. Section and paragraph blocks may be merged, and the locator
 * then carries the full range.
 */
export function segmentBlocks(blocks: ParsedBlock[], options: SegmentOptions = {}): SegmentInput[] {
  const { maxChars, minChars, overlapChars } = { ...DEFAULTS, ...options };
  const segments: SegmentInput[] = [];

  const push = (
    locatorType: LocatorType,
    locatorValue: string,
    heading: string | null,
    text: string,
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const sequence = segments.length;
    segments.push({
      id: `s${sequence + 1}`,
      locatorType,
      locatorValue,
      heading,
      text: trimmed,
      sequence,
      tokenEstimate: estimateTokens(trimmed),
    });
  };

  let pending: { blocks: ParsedBlock[]; length: number } | null = null;

  const flushPending = () => {
    if (!pending || pending.blocks.length === 0) return;
    const first = pending.blocks[0];
    const last = pending.blocks[pending.blocks.length - 1];
    const heading = pending.blocks.find((block) => block.heading)?.heading ?? null;
    const text = pending.blocks.map((block) => block.text).join("\n\n");
    for (const part of splitLongText(text, maxChars, overlapChars)) {
      push(first.locatorType, rangeLabel(first.locatorValue, last.locatorValue), heading, part);
    }
    pending = null;
  };

  for (const block of blocks) {
    if (block.locatorType === "page") {
      flushPending();
      for (const part of splitLongText(block.text, maxChars, overlapChars)) {
        push("page", block.locatorValue, block.heading, part);
      }
      continue;
    }

    if (block.text.length >= maxChars) {
      flushPending();
      for (const part of splitLongText(block.text, maxChars, overlapChars)) {
        push(block.locatorType, block.locatorValue, block.heading, part);
      }
      continue;
    }

    if (pending && pending.blocks[0].locatorType !== block.locatorType) {
      flushPending();
    }

    pending ??= { blocks: [], length: 0 };
    pending.blocks.push(block);
    pending.length += block.text.length + 2;

    if (pending.length >= minChars && pending.length + 200 >= maxChars) {
      flushPending();
    }
  }

  flushPending();
  return segments;
}

/** Formats a locator for display, e.g. "Page 7" or "Section 3". */
export function formatLocator(locatorType: LocatorType, locatorValue: string): string {
  const label =
    locatorType === "page" ? "Page" : locatorType === "section" ? "Section" : "Paragraph";
  return `${label} ${locatorValue}`;
}

/** Short form used in dense tables and CSV exports. */
export function formatLocatorShort(locatorType: LocatorType, locatorValue: string): string {
  const prefix = locatorType === "page" ? "p." : locatorType === "section" ? "§" : "¶";
  return `${prefix}${locatorValue}`;
}
