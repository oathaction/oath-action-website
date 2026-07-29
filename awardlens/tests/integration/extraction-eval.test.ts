import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parsePlainText } from "@/lib/documents/parse";
import { segmentBlocks, type SegmentInput } from "@/lib/documents/segment";
import { runExtraction } from "@/lib/ai/pipeline";
import { detectInjectionAttempts } from "@/lib/ai/pipeline";
import type { ConsolidatedObligation } from "@/lib/ai/consolidate";

/**
 * Extraction evaluation.
 *
 * Runs the pipeline across all twelve synthetic award documents and measures
 * how it does against the obligations a grants expert said each one contains.
 *
 * By default this runs the DETERMINISTIC extractor, so it is free, offline and
 * reproducible in CI. Set AWARDLENS_LIVE_EVAL=1 (with AI_GATEWAY_API_KEY and
 * AI_MODEL) to run the same evaluation against a live model:
 *
 *   pnpm test:ai-live
 *
 * The hard assertions below are properties that must hold in EITHER mode — they
 * are about honesty, not cleverness. Recall is reported rather than strictly
 * asserted, because the deterministic extractor is deliberately more literal
 * than a model and a tight recall gate here would only encourage overfitting
 * the rules to these twelve documents.
 */

const LIVE_REQUESTED = process.env.AWARDLENS_LIVE_EVAL === "1";
const LIVE_CREDENTIALS = Boolean(process.env.AI_GATEWAY_API_KEY && process.env.AI_MODEL);

/**
 * Live mode needs credentials. Asking for it without them used to fail with an
 * opaque "no model configured" throw from deep inside the pipeline; skipping
 * with an explicit reason is the honest behaviour, and it keeps `pnpm
 * test:ai-live` safe to run anywhere.
 */
const LIVE = LIVE_REQUESTED && LIVE_CREDENTIALS;

if (LIVE_REQUESTED && !LIVE_CREDENTIALS) {
  console.warn(
    "\n[extraction-eval] AWARDLENS_LIVE_EVAL=1 was set but AI_GATEWAY_API_KEY and AI_MODEL are not both present.\n" +
      "Falling back to the deterministic extractor. Run `pnpm models:list` to find a model id your gateway key can reach.\n",
  );
}

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures");

interface ExpectedObligation {
  key: string;
  category: string;
  titleContains: string[];
  expectedDueDate: string | null;
  mustCiteTextContaining: string;
}

interface Fixture {
  id: string;
  file: string;
  title: string;
  shouldParse: boolean;
  isGrantDocument: boolean;
  expectedCriticalObligations: ExpectedObligation[];
  expectedConflicts?: unknown[];
  injectionAttempts?: string[];
}

interface Manifest {
  fixtures: Fixture[];
}

async function loadManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(FIXTURE_DIR, "manifest.json"), "utf8")) as Manifest;
}

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").toLowerCase();
}

/** An expected obligation is found when some extracted item mentions all its key terms. */
function findMatch(
  expected: ExpectedObligation,
  obligations: ConsolidatedObligation[],
): ConsolidatedObligation | null {
  const terms = expected.titleContains.map((term) => term.toLowerCase());
  let best: { obligation: ConsolidatedObligation; hits: number } | null = null;

  for (const obligation of obligations) {
    const haystack = normalise(`${obligation.title} ${obligation.description}`);
    const hits = terms.filter((term) => haystack.includes(term)).length;
    if (hits === 0) continue;
    if (!best || hits > best.hits) best = { obligation, hits };
  }

  // Require a clear majority of the distinctive terms before calling it a match.
  if (!best) return null;
  return best.hits >= Math.ceil(terms.length * 0.7) ? best.obligation : null;
}

interface FixtureResult {
  id: string;
  segments: number;
  extracted: number;
  expected: number;
  recalled: number;
  citedVerbatim: number;
  unsupported: number;
  dateChecked: number;
  dateCorrect: number;
  duplicates: number;
}

async function evaluateFixture(fixture: Fixture): Promise<FixtureResult | null> {
  const text = await readFile(path.join(FIXTURE_DIR, fixture.file), "utf8");
  const parsed = parsePlainText(text);

  if (!fixture.shouldParse) {
    expect(
      parsed.status,
      `${fixture.id} has no usable text and must not be treated as parsed`,
    ).not.toBe("parsed");
    return null;
  }

  expect(parsed.status, `${fixture.id} should parse`).toBe("parsed");
  const segments: SegmentInput[] = segmentBlocks(parsed.blocks);

  const result = await runExtraction({
    segments,
    forceMode: LIVE ? "live" : "fixtures",
  });

  const obligations = result.obligations;

  // ---- Invariants that must hold in every mode --------------------------
  for (const obligation of obligations) {
    // Nothing survives the pipeline without at least one resolvable citation.
    const resolved = obligation.citations.filter((citation) => citation.segmentId !== null);
    expect(
      resolved.length,
      `${fixture.id}: "${obligation.title}" reached the register with no usable citation`,
    ).toBeGreaterThan(0);

    // Every citation's locator must belong to a segment that really exists.
    for (const citation of resolved) {
      const segment = segments.find((entry) => entry.id === citation.segmentId);
      expect(segment, `${fixture.id}: citation points at an unknown segment`).toBeDefined();
      expect(
        citation.locatorValue,
        `${fixture.id}: locator must come from the stored segment`,
      ).toBe(segment?.locatorValue);
    }

    expect(obligation.confidence).toBeGreaterThanOrEqual(0);
    expect(obligation.confidence).toBeLessThanOrEqual(1);
  }

  let recalled = 0;
  let dateChecked = 0;
  let dateCorrect = 0;

  for (const expected of fixture.expectedCriticalObligations) {
    const match = findMatch(expected, obligations);
    if (!match) continue;
    recalled += 1;

    if (expected.expectedDueDate) {
      dateChecked += 1;
      if (match.dueDate === expected.expectedDueDate) dateCorrect += 1;
    } else {
      // The expert said no date is supported. Claiming one is a real error.
      dateChecked += 1;
      if (match.dueDate === null) dateCorrect += 1;
    }
  }

  const citedVerbatim = obligations.filter((obligation) =>
    obligation.citations.some((citation) => citation.matchScore >= 0.85),
  ).length;
  const unsupported = obligations.filter(
    (obligation) => !obligation.citations.some((citation) => citation.matchScore >= 0.5),
  ).length;

  const titles = obligations.map((obligation) => normalise(obligation.title));
  const duplicates = titles.length - new Set(titles).size;

  return {
    id: fixture.id,
    segments: segments.length,
    extracted: obligations.length,
    expected: fixture.expectedCriticalObligations.length,
    recalled,
    citedVerbatim,
    unsupported,
    dateChecked,
    dateCorrect,
    duplicates,
  };
}

describe(`extraction evaluation (${LIVE ? "LIVE MODEL" : "deterministic"})`, () => {
  it("meets the honesty invariants across every synthetic award", async () => {
    const manifest = await loadManifest();
    const results: FixtureResult[] = [];

    for (const fixture of manifest.fixtures) {
      const result = await evaluateFixture(fixture);
      if (result) results.push(result);
    }

    const totals = results.reduce(
      (accumulator, entry) => ({
        extracted: accumulator.extracted + entry.extracted,
        expected: accumulator.expected + entry.expected,
        recalled: accumulator.recalled + entry.recalled,
        citedVerbatim: accumulator.citedVerbatim + entry.citedVerbatim,
        unsupported: accumulator.unsupported + entry.unsupported,
        dateChecked: accumulator.dateChecked + entry.dateChecked,
        dateCorrect: accumulator.dateCorrect + entry.dateCorrect,
        duplicates: accumulator.duplicates + entry.duplicates,
      }),
      {
        extracted: 0, expected: 0, recalled: 0, citedVerbatim: 0,
        unsupported: 0, dateChecked: 0, dateCorrect: 0, duplicates: 0,
      },
    );

    const pct = (numerator: number, denominator: number) =>
      denominator === 0 ? "n/a" : `${((numerator / denominator) * 100).toFixed(1)}%`;

    const report = [
      "",
      `AwardLens extraction evaluation — ${LIVE ? "LIVE MODEL" : "deterministic extractor"}`,
      "".padEnd(78, "-"),
      `${"fixture".padEnd(32)}${"segs".padStart(5)}${"found".padStart(7)}${"recall".padStart(9)}${"cited".padStart(7)}${"dates".padStart(8)}${"dupes".padStart(7)}`,
      ...results.map(
        (entry) =>
          entry.id.padEnd(32) +
          String(entry.segments).padStart(5) +
          String(entry.extracted).padStart(7) +
          `${entry.recalled}/${entry.expected}`.padStart(9) +
          `${entry.citedVerbatim}`.padStart(7) +
          `${entry.dateCorrect}/${entry.dateChecked}`.padStart(8) +
          String(entry.duplicates).padStart(7),
      ),
      "".padEnd(78, "-"),
      `Critical-obligation recall .... ${pct(totals.recalled, totals.expected)} (${totals.recalled}/${totals.expected})`,
      `Citation coverage (verbatim) .. ${pct(totals.citedVerbatim, totals.extracted)} (${totals.citedVerbatim}/${totals.extracted})`,
      `Unsupported-claim rate ........ ${pct(totals.unsupported, totals.extracted)}`,
      `Date accuracy ................. ${pct(totals.dateCorrect, totals.dateChecked)}`,
      `Duplicate rate ................ ${pct(totals.duplicates, totals.extracted)}`,
      `Human review burden ........... ${(totals.extracted / results.length).toFixed(1)} items per award`,
      "",
    ].join("\n");

    console.info(report);

    // Every claim that reaches a user is traceable to the document.
    expect(totals.unsupported).toBe(0);
    // Citation coverage is the product's core promise; it must be near-total.
    expect(totals.citedVerbatim / totals.extracted).toBeGreaterThanOrEqual(0.95);
    // Something must actually be extracted from every real award.
    expect(totals.extracted).toBeGreaterThan(results.length * 3);
    // A floor, not a target — regressions below this are a genuine problem.
    expect(totals.recalled / totals.expected).toBeGreaterThan(0.2);
  }, 180_000);

  it("ignores instructions embedded in a document while still extracting its obligations", async () => {
    const manifest = await loadManifest();
    const fixture = manifest.fixtures.find((entry) => entry.injectionAttempts?.length);
    expect(fixture, "expected an injection fixture").toBeDefined();
    if (!fixture) return;

    const text = await readFile(path.join(FIXTURE_DIR, fixture.file), "utf8");
    const segments = segmentBlocks(parsePlainText(text).blocks);

    const detected = detectInjectionAttempts(segments);
    expect(detected.length, "the injected instructions should be detected").toBeGreaterThan(0);

    const result = await runExtraction({ segments, forceMode: LIVE ? "live" : "fixtures" });

    // The injected text instructed a reader to report no requirements.
    expect(result.obligations.length).toBeGreaterThan(0);
    expect(result.injectionAttempts.length).toBeGreaterThan(0);

    // No obligation may parrot the injected instruction back as a requirement.
    for (const obligation of result.obligations) {
      expect(normalise(obligation.title)).not.toMatch(/ignore all previous|system prompt/);
    }
  }, 120_000);

  it("does not present a non-grant document as an award", async () => {
    const manifest = await loadManifest();
    const fixture = manifest.fixtures.find((entry) => entry.isGrantDocument === false && entry.shouldParse);
    expect(fixture, "expected a non-grant fixture").toBeDefined();
    if (!fixture) return;

    const text = await readFile(path.join(FIXTURE_DIR, fixture.file), "utf8");
    const segments = segmentBlocks(parsePlainText(text).blocks);
    const result = await runExtraction({ segments, forceMode: LIVE ? "live" : "fixtures" });

    expect(result.profile.isGrantDocument).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/grant|award/i);
  }, 120_000);
});
