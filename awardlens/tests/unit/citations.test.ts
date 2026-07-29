import { describe, expect, it } from "vitest";

import {
  PARTIAL_THRESHOLD,
  VERIFIED_THRESHOLD,
  matchExcerpt,
  normaliseWithMap,
  resolveCitations,
  summariseCoverage,
} from "@/lib/ai/citations";
import type { ExtractedCitation } from "@/lib/ai/schemas";
import type { SourceStatus } from "@/lib/domain/types";

import { makeSegment } from "./_helpers/factories";

/**
 * citations.ts is the mechanism that makes a fabricated source impossible.
 * The tests below are written as properties of that mechanism, not as
 * descriptions of its implementation.
 */

const NBSP = " ";
const FIGURE_SPACE = " ";
const NARROW_NBSP = " ";
const SOFT_HYPHEN = "­";

describe("normaliseWithMap", () => {
  it("collapses runs of whitespace to a single space", () => {
    const { normalised } = normaliseWithMap("The   Grantee\n\n shall\tsubmit");
    expect(normalised).toBe("the grantee shall submit");
  });

  it("trims leading and trailing whitespace", () => {
    const { normalised } = normaliseWithMap("   annual report   ");
    expect(normalised).toBe("annual report");
  });

  it("maps every normalised character back to its index in the original text", () => {
    const original = "  Hello   World  ";
    const { normalised, map } = normaliseWithMap(original);

    expect(normalised).toBe("hello world");
    expect(map).toEqual([2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14]);
    expect(map).toHaveLength(normalised.length);
    // The first character of "World" in the normalised string is at index 6.
    expect(original[map[6]]).toBe("W");
  });

  it("keeps the map aligned after a soft hyphen is dropped", () => {
    const original = `co${SOFT_HYPHEN}operate`;
    const { normalised, map } = normaliseWithMap(original);

    expect(normalised).toBe("cooperate");
    // Index 2 of "cooperate" is the "o" that lives after the soft hyphen.
    expect(map[2]).toBe(3);
    expect(original[map[2]]).toBe("o");
  });

  it("folds curly single quotes and apostrophes to a straight apostrophe", () => {
    expect(normaliseWithMap("Grantee’s ‘scope’ ʼstatement").normalised).toBe(
      "grantee's 'scope' 'statement",
    );
  });

  it("folds curly double quotes to straight double quotes", () => {
    expect(normaliseWithMap("“the Grantee”").normalised).toBe('"the grantee"');
  });

  it("folds en dash, em dash and minus sign to a hyphen", () => {
    expect(normaliseWithMap("2026–2027 — total − 5").normalised).toBe(
      "2026-2027 - total - 5",
    );
  });

  it("treats non-breaking, figure and narrow spaces as ordinary whitespace", () => {
    const { normalised } = normaliseWithMap(`30${NBSP}days${FIGURE_SPACE}and${NARROW_NBSP}nights`);
    expect(normalised).toBe("30 days and nights");
  });

  it("returns an empty result for whitespace-only input", () => {
    const { normalised, map } = normaliseWithMap("   \n\t  ");
    expect(normalised).toBe("");
    expect(map).toEqual([]);
  });

  it("lowercases so casing differences never cost a citation its score", () => {
    expect(normaliseWithMap("FINAL REPORT").normalised).toBe(
      normaliseWithMap("Final Report").normalised,
    );
  });
});

describe("matchExcerpt", () => {
  const segmentText =
    "3.1 Annual Report. The Grantee shall submit a single annual report to the Foundation no later than April 30, 2027.";

  it("scores a verbatim quotation 1 and returns offsets into the original text", () => {
    const excerpt = "shall submit a single annual report";
    const match = matchExcerpt(excerpt, segmentText);

    expect(match.score).toBe(1);
    expect(match.startOffset).toBe(segmentText.indexOf(excerpt));
    expect(segmentText.slice(match.startOffset!, match.endOffset!)).toBe(excerpt);
  });

  it("returns offsets that survive whitespace collapsing in the source", () => {
    const spaced = "The   Grantee\n\nshall   submit a report.";
    const match = matchExcerpt("Grantee shall submit a report.", spaced);

    expect(match.score).toBe(1);
    expect(spaced.slice(match.startOffset!, match.endOffset!)).toBe(
      "Grantee\n\nshall   submit a report.",
    );
  });

  it("still scores 1 when only typography differs between quote and source", () => {
    const source =
      "The Grantee’s report is due April 30, 2027—see “Exhibit A” for the form.";
    const quote = "The Grantee's report is due April 30, 2027-see \"Exhibit A\" for the form.";

    expect(matchExcerpt(quote, source).score).toBe(1);
  });

  it("scores a near quotation high without demanding it be verbatim", () => {
    const source =
      "The Recipient shall submit to the Commission a quarterly match documentation report within thirty days after the end of each calendar quarter, together with source documentation identifying the contributor, the date of the contribution, and the basis of valuation for every item claimed as cost share.";
    const nearQuote = source.replace("thirty days", "30 days");

    const match = matchExcerpt(nearQuote, source);
    expect(match.score).toBeGreaterThan(0.85);
    expect(match.score).toBeLessThan(1);
    // The highlight still anchors on the longest run of the quote that is real.
    expect(match.startOffset).toBe(0);
  });

  it("scores unrelated text far below the partial threshold", () => {
    const match = matchExcerpt(
      "The Grantee shall purchase two helicopters before the opening of the fiscal year.",
      segmentText,
    );
    // Shared boilerplate words cannot lift an invented sentence into range.
    expect(match.score).toBeLessThan(0.2);
    expect(match.score).toBeLessThan(PARTIAL_THRESHOLD);
  });

  it("scores text with no shared phrasing exactly 0", () => {
    const match = matchExcerpt(
      "Helicopter maintenance manifests must be filed with aviation authorities fortnightly.",
      segmentText,
    );
    expect(match.score).toBe(0);
    expect(match.startOffset).toBeNull();
  });

  it("scores an empty excerpt 0 with no offsets", () => {
    const match = matchExcerpt("   ", segmentText);
    expect(match).toEqual({ score: 0, startOffset: null, endOffset: null });
  });

  it("scores anything against an empty segment 0", () => {
    expect(matchExcerpt("annual report", "").score).toBe(0);
  });

  it("scores a partially-real quotation between the two thresholds", () => {
    const source = "The Grantee shall submit the annual narrative report to the Foundation.";
    // Only the final word is invented; four of five trigrams survive.
    const match = matchExcerpt("Grantee shall submit the annual narrative summary", source);

    expect(match.score).toBeCloseTo(0.8, 10);
    expect(match.score).toBeGreaterThanOrEqual(PARTIAL_THRESHOLD);
    expect(match.score).toBeLessThan(VERIFIED_THRESHOLD);
  });
});

describe("resolveCitations — anti-fabrication invariants", () => {
  const pageThree = makeSegment({
    id: "s1",
    locatorType: "page",
    locatorValue: "3",
    sequence: 0,
    text: "3.1 Annual Report. The Grantee shall submit a single annual report to the Foundation no later than April 30, 2027.",
  });

  const pageSeven = makeSegment({
    id: "s2",
    locatorType: "page",
    locatorValue: "7",
    sequence: 1,
    text: "7.4 Governing Law. This Agreement shall be governed by the laws of the State of Ohio without regard to its conflict of laws principles.",
  });

  const segments = [pageThree, pageSeven];

  function cite(overrides: Partial<ExtractedCitation>): ExtractedCitation {
    return {
      segmentId: "s1",
      locatorType: "page",
      locatorValue: "3",
      excerpt: "shall submit a single annual report",
      ...overrides,
    };
  }

  it("gives a fabricated excerpt no segment and no locator value at all", () => {
    const result = resolveCitations(
      [
        cite({
          excerpt:
            "The Grantee shall charter a helicopter fleet and file an aviation manifest each fortnight.",
        }),
      ],
      segments,
    );

    const [citation] = result.citations;
    expect(citation.segmentId).toBeNull();
    expect(citation.locatorValue).toBe("");
    expect(citation.startOffset).toBeNull();
    expect(citation.endOffset).toBeNull();
    expect(result.sourceStatus).toBe("unverified");
  });

  it("never invents a page number for an excerpt that is nowhere in the document", () => {
    const result = resolveCitations(
      [
        cite({
          segmentId: "s2",
          locatorValue: "7",
          excerpt: "Unexpended funds shall be wired to an offshore account within ten days.",
        }),
      ],
      segments,
    );

    // The model declared page 7. Because the quote is not real, nothing is kept.
    expect(result.citations[0].locatorValue).not.toBe("7");
    expect(result.citations[0].locatorValue).toBe("");
    expect(result.citations[0].segmentId).toBeNull();
  });

  it("returns the REAL segment's locator when the model declares the wrong segment", () => {
    const result = resolveCitations(
      [
        cite({
          // The model claims page 7, but its quotation actually lives on page 3.
          segmentId: "s2",
          locatorType: "page",
          locatorValue: "7",
          excerpt: "shall submit a single annual report to the Foundation",
        }),
      ],
      segments,
    );

    const [citation] = result.citations;
    expect(citation.segmentId).toBe("s1");
    expect(citation.locatorValue).toBe("3");
    expect(citation.locatorValue).not.toBe("7");
    expect(citation.matchScore).toBe(1);
    expect(result.sourceStatus).toBe("verified");
  });

  it("recovers a real quotation even when the declared segment id does not exist", () => {
    const result = resolveCitations(
      [cite({ segmentId: "s999", locatorValue: "42" })],
      segments,
    );

    expect(result.citations[0].segmentId).toBe("s1");
    expect(result.citations[0].locatorValue).toBe("3");
  });

  it("takes the locator type from the stored segment, never from the model", () => {
    const result = resolveCitations(
      [cite({ locatorType: "section", locatorValue: "12" })],
      segments,
    );

    expect(result.citations[0].locatorType).toBe("page");
    expect(result.citations[0].locatorValue).toBe("3");
  });

  it("keeps the model's excerpt verbatim on the resolved citation", () => {
    const excerpt = "shall submit a single annual report";
    const result = resolveCitations([cite({ excerpt })], segments);
    expect(result.citations[0].excerpt).toBe(excerpt);
  });

  it("returns an empty resolution and an unverified status for no citations", () => {
    const result = resolveCitations([], segments);
    expect(result.citations).toEqual([]);
    expect(result.bestScore).toBe(0);
    expect(result.sourceStatus).toBe("unverified");
  });

  it("refuses to attach a locator when there are no stored segments at all", () => {
    const result = resolveCitations([cite({})], []);
    expect(result.citations[0].segmentId).toBeNull();
    expect(result.citations[0].matchScore).toBe(0);
  });
});

describe("resolveCitations — source status thresholds", () => {
  // A constructed vocabulary so the shingle arithmetic is exact and legible.
  const WORDS = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
    "quebec", "romeo", "sierra", "tango", "uniform", "victor",
  ];
  const source = WORDS.join(" ");
  const segments = [
    makeSegment({ id: "s1", locatorType: "section", locatorValue: "4", text: source }),
  ];

  function resolveExcerpt(excerpt: string) {
    return resolveCitations(
      [{ segmentId: "s1", locatorType: "section", locatorValue: "4", excerpt }],
      segments,
    );
  }

  it("exposes the documented thresholds", () => {
    expect(VERIFIED_THRESHOLD).toBe(0.85);
    expect(PARTIAL_THRESHOLD).toBe(0.5);
  });

  it("marks an exact quotation verified", () => {
    const result = resolveExcerpt(source);
    expect(result.bestScore).toBe(1);
    expect(result.sourceStatus).toBe("verified");
  });

  it("marks a score of exactly 0.85 verified", () => {
    // One substituted word breaks exactly 3 of 20 trigrams: 17/20 = 0.85.
    const excerpt = WORDS.map((word, index) => (index === 10 ? "zulu" : word)).join(" ");
    const result = resolveExcerpt(excerpt);

    expect(result.bestScore).toBe(0.85);
    expect(result.sourceStatus).toBe("verified");
  });

  it("marks a score between 0.5 and 0.85 partial", () => {
    // Two substituted words break 6 of 20 trigrams: 14/20 = 0.7.
    const excerpt = WORDS.map((word, index) =>
      index === 6 || index === 14 ? "zulu" : word,
    ).join(" ");
    const result = resolveExcerpt(excerpt);

    expect(result.bestScore).toBe(0.7);
    expect(result.sourceStatus).toBe("partial");
    expect(result.citations[0].segmentId).toBe("s1");
    expect(result.citations[0].locatorValue).toBe("4");
  });

  it("marks anything below 0.5 unverified and drops its locator", () => {
    const result = resolveExcerpt("zulu whiskey xray yankee quebec sierra golf");
    expect(result.bestScore).toBeLessThan(PARTIAL_THRESHOLD);
    expect(result.sourceStatus).toBe("unverified");
    expect(result.citations[0].segmentId).toBeNull();
  });

  it("derives the status from the best usable citation, not the worst", () => {
    const result = resolveCitations(
      [
        {
          segmentId: "s1",
          locatorType: "section",
          locatorValue: "4",
          excerpt: "zulu whiskey xray yankee",
        },
        { segmentId: "s1", locatorType: "section", locatorValue: "4", excerpt: source },
      ],
      segments,
    );

    expect(result.citations[0].segmentId).toBeNull();
    expect(result.citations[1].segmentId).toBe("s1");
    expect(result.sourceStatus).toBe("verified");
  });

  it("rounds the stored match score to three decimal places", () => {
    // 19/20 trigrams survive a single trailing substitution.
    const excerpt = WORDS.map((word, index) => (index === 21 ? "zulu" : word)).join(" ");
    const result = resolveExcerpt(excerpt);
    expect(result.citations[0].matchScore).toBe(0.95);
    expect(String(result.citations[0].matchScore).replace(/^\d+\.?/, "").length).toBeLessThanOrEqual(3);
  });
});

describe("summariseCoverage", () => {
  it("counts each status and reports verified share as coverage", () => {
    const statuses: SourceStatus[] = ["verified", "verified", "partial", "unverified"];
    expect(summariseCoverage(statuses)).toEqual({
      total: 4,
      verified: 2,
      partial: 1,
      unverified: 1,
      coverage: 0.5,
    });
  });

  it("reports zero coverage for an empty register rather than dividing by zero", () => {
    expect(summariseCoverage([])).toEqual({
      total: 0,
      verified: 0,
      partial: 0,
      unverified: 0,
      coverage: 0,
    });
  });

  it("rounds coverage to three decimal places", () => {
    expect(summariseCoverage(["verified", "partial", "unverified"]).coverage).toBe(0.333);
  });

  it("gives coverage 1 only when every obligation is verified", () => {
    expect(summariseCoverage(["verified", "verified"]).coverage).toBe(1);
    expect(summariseCoverage(["verified", "partial"]).coverage).toBe(0.5);
  });

  it("does not count partial matches towards coverage", () => {
    const summary = summariseCoverage(["partial", "partial", "partial", "partial"]);
    expect(summary.partial).toBe(4);
    expect(summary.coverage).toBe(0);
  });
});
