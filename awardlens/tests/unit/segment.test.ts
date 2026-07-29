import { describe, expect, it } from "vitest";

import type { ParsedBlock } from "@/lib/documents/parse";
import { parsePlainText } from "@/lib/documents/parse";
import {
  estimateTokens,
  formatLocator,
  formatLocatorShort,
  segmentBlocks,
} from "@/lib/documents/segment";

import { readFixture } from "./_helpers/factories";

const EN_DASH = "–";

function block(overrides: Partial<ParsedBlock> & { text: string }): ParsedBlock {
  return { locatorType: "paragraph", locatorValue: "1", heading: null, ...overrides };
}

/** A sentence-terminated filler of roughly `chars` characters. */
function filler(chars: number, seed = "The Grantee shall comply with this requirement. "): string {
  return seed.repeat(Math.ceil(chars / seed.length)).slice(0, chars);
}

describe("segmentBlocks — page locators are never merged", () => {
  it("keeps each page in its own segment so a page citation means that page", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "1", text: "Page one text." }),
      block({ locatorType: "page", locatorValue: "2", text: "Page two text." }),
      block({ locatorType: "page", locatorValue: "3", text: "Page three text." }),
    ]);

    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.locatorValue)).toEqual(["1", "2", "3"]);
    expect(segments[1].text).toBe("Page two text.");
  });

  it("never produces a page-range locator", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "6", text: "Short page." }),
      block({ locatorType: "page", locatorValue: "7", text: "Another short page." }),
    ]);

    expect(segments.every((segment) => !segment.locatorValue.includes(EN_DASH))).toBe(true);
    expect(segments.map((segment) => segment.locatorValue)).toEqual(["6", "7"]);
  });

  it("does not merge tiny pages together even when far below the minimum size", () => {
    const segments = segmentBlocks(
      Array.from({ length: 6 }, (_, index) =>
        block({ locatorType: "page", locatorValue: String(index + 1), text: `p${index + 1}.` }),
      ),
    );
    expect(segments).toHaveLength(6);
  });

  it("flushes pending paragraph blocks before a page block, keeping them separate", () => {
    const segments = segmentBlocks([
      block({ locatorType: "paragraph", locatorValue: "1", text: "A paragraph." }),
      block({ locatorType: "page", locatorValue: "1", text: "A page." }),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0].locatorType).toBe("paragraph");
    expect(segments[1].locatorType).toBe("page");
  });
});

describe("segmentBlocks — oversized blocks are split, not truncated", () => {
  it("splits an oversized page into several segments that all keep the same page number", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "7", text: filler(9000) }),
    ]);

    expect(segments.length).toBeGreaterThan(2);
    expect(segments.every((segment) => segment.locatorType === "page")).toBe(true);
    expect(segments.every((segment) => segment.locatorValue === "7")).toBe(true);
  });

  it("keeps every split segment within the configured maximum size", () => {
    const segments = segmentBlocks(
      [block({ locatorType: "page", locatorValue: "1", text: filler(9000) })],
      { maxChars: 1000 },
    );
    expect(segments.every((segment) => segment.text.length <= 1000)).toBe(true);
    expect(segments.length).toBeGreaterThan(8);
  });

  it("ends every segment on a whole word so a quotation never stops mid-word", () => {
    const text = filler(6000);
    const source = new Set(text.split(/\s+/).filter(Boolean));
    const segments = segmentBlocks([block({ locatorType: "page", locatorValue: "1", text })]);

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      const tokens = segment.text.split(/\s+/).filter(Boolean);
      expect(source.has(tokens[tokens.length - 1])).toBe(true);
    }
  });

  it("keeps every word of the source somewhere in the segments", () => {
    const text = filler(6000);
    const segments = segmentBlocks([block({ locatorType: "page", locatorValue: "1", text })]);
    const covered = new Set(segments.flatMap((segment) => segment.text.split(/\s+/)));

    for (const token of text.split(/\s+/).filter(Boolean)) {
      expect(covered.has(token)).toBe(true);
    }
  });

  it("repeats a little trailing context into the next segment so a quote spanning the cut still matches", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "1", text: filler(6000) }),
    ]);
    const tailOfFirst = segments[0].text.slice(-60);
    expect(segments[1].text.startsWith(tailOfFirst.slice(0, 20))).toBe(false);
    // The overlap window means the two segments together are longer than the source slice.
    const joined = segments.reduce((sum, segment) => sum + segment.text.length, 0);
    expect(joined).toBeGreaterThan(6000);
  });

  it("splits an oversized section block while keeping its locator", () => {
    const segments = segmentBlocks([
      block({ locatorType: "section", locatorValue: "4", text: filler(7000) }),
    ]);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.locatorValue === "4")).toBe(true);
    expect(segments.every((segment) => segment.locatorType === "section")).toBe(true);
  });

  it("loses no substantive text when splitting", () => {
    const marker = "MARKER-DEADLINE-2027";
    const text = `${filler(4000)} ${marker} ${filler(4000)}`;
    const segments = segmentBlocks([block({ locatorType: "page", locatorValue: "1", text })]);

    expect(segments.some((segment) => segment.text.includes(marker))).toBe(true);
  });
});

describe("segmentBlocks — section and paragraph blocks merge with a range locator", () => {
  it("merges consecutive paragraph blocks and reports the full range", () => {
    const segments = segmentBlocks(
      [3, 4, 5, 6, 7].map((n) =>
        block({ locatorType: "paragraph", locatorValue: String(n), text: filler(100) }),
      ),
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].locatorType).toBe("paragraph");
    expect(segments[0].locatorValue).toBe(`3${EN_DASH}7`);
  });

  it("uses a single value rather than a range when only one block merged", () => {
    const segments = segmentBlocks([
      block({ locatorType: "paragraph", locatorValue: "3", text: filler(100) }),
    ]);
    expect(segments[0].locatorValue).toBe("3");
  });

  it("merges consecutive section blocks the same way", () => {
    const segments = segmentBlocks(
      ["1", "2", "3"].map((value) =>
        block({ locatorType: "section", locatorValue: value, text: filler(80) }),
      ),
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].locatorValue).toBe(`1${EN_DASH}3`);
  });

  it("never merges across a change of locator type", () => {
    const segments = segmentBlocks([
      block({ locatorType: "section", locatorValue: "1", text: filler(80) }),
      block({ locatorType: "paragraph", locatorValue: "2", text: filler(80) }),
      block({ locatorType: "section", locatorValue: "3", text: filler(80) }),
    ]);

    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.locatorType)).toEqual([
      "section",
      "paragraph",
      "section",
    ]);
  });

  it("flushes a merged group once it approaches the maximum size", () => {
    const segments = segmentBlocks(
      Array.from({ length: 8 }, (_, index) =>
        block({ locatorType: "paragraph", locatorValue: String(index + 1), text: filler(400) }),
      ),
    );

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.text.length <= 2600)).toBe(true);
  });

  it("carries the first heading found in a merged group", () => {
    const segments = segmentBlocks([
      block({ locatorType: "section", locatorValue: "1", heading: null, text: filler(60) }),
      block({
        locatorType: "section",
        locatorValue: "2",
        heading: "ARTICLE III. REPORTING",
        text: filler(60),
      }),
    ]);

    expect(segments[0].heading).toBe("ARTICLE III. REPORTING");
  });
});

describe("segmentBlocks — segment identity", () => {
  it("assigns stable sequential ids starting at s1", () => {
    const segments = segmentBlocks(
      Array.from({ length: 4 }, (_, index) =>
        block({ locatorType: "page", locatorValue: String(index + 1), text: `Page ${index + 1}.` }),
      ),
    );

    expect(segments.map((segment) => segment.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(segments.map((segment) => segment.sequence)).toEqual([0, 1, 2, 3]);
  });

  it("produces identical ids for identical input on every run", () => {
    const blocks = Array.from({ length: 5 }, (_, index) =>
      block({ locatorType: "page", locatorValue: String(index + 1), text: filler(300) }),
    );
    expect(segmentBlocks(blocks)).toEqual(segmentBlocks(blocks));
  });

  it("drops blocks that are empty once trimmed, without gapping the ids", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "1", text: "Real content." }),
      block({ locatorType: "page", locatorValue: "2", text: "   \n  " }),
      block({ locatorType: "page", locatorValue: "3", text: "More content." }),
    ]);

    expect(segments.map((segment) => segment.id)).toEqual(["s1", "s2"]);
    expect(segments.map((segment) => segment.locatorValue)).toEqual(["1", "3"]);
  });

  it("trims surrounding whitespace from segment text", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "1", text: "\n\n  Content here.  \n\n" }),
    ]);
    expect(segments[0].text).toBe("Content here.");
  });

  it("returns nothing for no blocks", () => {
    expect(segmentBlocks([])).toEqual([]);
  });

  it("records a token estimate proportional to the text length", () => {
    const segments = segmentBlocks([
      block({ locatorType: "page", locatorValue: "1", text: "A".repeat(400) }),
    ]);
    expect(segments[0].tokenEstimate).toBe(100);
    expect(estimateTokens("A".repeat(401))).toBe(101);
  });

  it("segments a real fixture into one segment per page", () => {
    const parsed = parsePlainText(readFixture("01-simple-foundation-grant.txt"));
    const segments = segmentBlocks(parsed.blocks);

    expect(segments.map((segment) => segment.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(segments.map((segment) => segment.locatorValue)).toEqual(["1", "2", "3", "4", "5"]);
    expect(segments.every((segment) => segment.locatorType === "page")).toBe(true);
  });
});

describe("formatLocator", () => {
  it("formats each locator type in long form", () => {
    expect(formatLocator("page", "7")).toBe("Page 7");
    expect(formatLocator("section", "3.1")).toBe("Section 3.1");
    expect(formatLocator("paragraph", "12")).toBe("Paragraph 12");
  });

  it("keeps a range intact", () => {
    expect(formatLocator("paragraph", `3${EN_DASH}7`)).toBe(`Paragraph 3${EN_DASH}7`);
  });
});

describe("formatLocatorShort", () => {
  it("formats each locator type in short form", () => {
    expect(formatLocatorShort("page", "7")).toBe("p.7");
    expect(formatLocatorShort("section", "3.1")).toBe("§3.1");
    expect(formatLocatorShort("paragraph", "12")).toBe("¶12");
  });

  it("keeps a range intact", () => {
    expect(formatLocatorShort("page", "7")).toBe("p.7");
    expect(formatLocatorShort("section", `1${EN_DASH}3`)).toBe(`§1${EN_DASH}3`);
  });
});
