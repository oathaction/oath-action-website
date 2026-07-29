import { describe, expect, it } from "vitest";

import {
  consolidateCandidates,
  isSameObligation,
  similarity,
  tokenSet,
  type CandidateWithEvidence,
} from "@/lib/ai/consolidate";

import { makeCandidate, makeResolvedCitation } from "./_helpers/factories";

function entry(
  candidate: Parameters<typeof makeCandidate>[0],
  options: { citations?: CandidateWithEvidence["citations"]; origin?: CandidateWithEvidence["origin"] } = {},
): CandidateWithEvidence {
  return {
    candidate: makeCandidate(candidate),
    citations: options.citations ?? [makeResolvedCitation()],
    origin: options.origin ?? "extracted",
  };
}

describe("tokenSet", () => {
  it("drops stop words and very short tokens", () => {
    expect([...tokenSet("The Grantee shall submit a quarterly report")].sort()).toEqual([
      "quarterly",
      "report",
      "submit",
    ]);
  });

  it("drops the domain stop words that appear in almost every obligation", () => {
    const tokens = tokenSet("The recipient organization must submit the grant award report");
    expect(tokens.has("recipient")).toBe(false);
    expect(tokens.has("organization")).toBe(false);
    expect(tokens.has("grant")).toBe(false);
    expect(tokens.has("award")).toBe(false);
    expect(tokens.has("report")).toBe(true);
  });

  it("is case insensitive and strips punctuation", () => {
    expect(tokenSet("SF-425, quarterly!")).toEqual(tokenSet("sf 425 quarterly"));
  });

  it("deduplicates repeated words", () => {
    expect(tokenSet("report report report").size).toBe(1);
  });

  it("returns an empty set for text made only of stop words", () => {
    expect(tokenSet("the a of for to and or in on at by with").size).toBe(0);
  });
});

describe("similarity", () => {
  it("scores identical content 1", () => {
    expect(similarity("Quarterly financial report", "Quarterly financial report")).toBe(1);
  });

  it("scores identical content 1 regardless of stop words and casing", () => {
    expect(similarity("The quarterly financial report", "Quarterly financial report for the award")).toBe(1);
  });

  it("scores disjoint content 0", () => {
    expect(similarity("Quarterly financial report", "Insurance certificate deadline")).toBe(0);
  });

  it("scores partial overlap between 0 and 1", () => {
    const score = similarity("Quarterly financial report", "Quarterly narrative report");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    // {quarterly, report} shared out of {quarterly, financial, narrative, report}.
    expect(score).toBeCloseTo(0.5, 10);
  });

  it("scores anything against empty content 0", () => {
    expect(similarity("", "Quarterly report")).toBe(0);
    expect(similarity("the a of", "Quarterly report")).toBe(0);
  });

  it("is symmetric", () => {
    expect(similarity("annual narrative report", "annual report of activities")).toBe(
      similarity("annual report of activities", "annual narrative report"),
    );
  });
});

describe("isSameObligation", () => {
  it("merges near-identical titles in the same category", () => {
    expect(
      isSameObligation(
        makeCandidate({ category: "reporting", title: "Annual narrative report" }),
        makeCandidate({ category: "reporting", title: "Annual narrative report submission" }),
      ),
    ).toBe(true);
  });

  it("NEVER merges across categories, however similar the wording", () => {
    expect(
      isSameObligation(
        makeCandidate({ category: "reporting", title: "Annual financial report" }),
        makeCandidate({ category: "financial", title: "Annual financial report" }),
      ),
    ).toBe(false);
  });

  it("NEVER merges a quarterly report with an annual report", () => {
    expect(
      isSameObligation(
        makeCandidate({ category: "reporting", title: "Programmatic report", recurrence: "quarterly" }),
        makeCandidate({ category: "reporting", title: "Programmatic report", recurrence: "annual" }),
      ),
    ).toBe(false);
  });

  it("merges when both candidates state the same recurrence", () => {
    expect(
      isSameObligation(
        makeCandidate({ category: "reporting", title: "Programmatic report", recurrence: "quarterly" }),
        makeCandidate({ category: "reporting", title: "Programmatic report", recurrence: "Quarterly " }),
      ),
    ).toBe(true);
  });

  it("does not treat a missing recurrence as a separator", () => {
    expect(
      isSameObligation(
        makeCandidate({ category: "reporting", title: "Programmatic report", recurrence: "quarterly" }),
        makeCandidate({ category: "reporting", title: "Programmatic report", recurrence: null }),
      ),
    ).toBe(true);
  });

  it("keeps genuinely different duties apart", () => {
    expect(
      isSameObligation(
        makeCandidate({ category: "reporting", title: "Annual narrative report" }),
        makeCandidate({ category: "reporting", title: "Certificate of insurance filing" }),
      ),
    ).toBe(false);
  });

  it("merges a looser title match when the substance strongly agrees", () => {
    const description =
      "Any unexpended funds remaining at the conclusion of the grant period shall be returned within sixty days.";
    expect(
      isSameObligation(
        makeCandidate({ category: "closeout", title: "Return unexpended funds to the Foundation", description }),
        makeCandidate({ category: "closeout", title: "Return unexpended funds", description }),
      ),
    ).toBe(true);
  });

  it("does not merge on description similarity alone when titles are unrelated", () => {
    const shared =
      "The Grantee shall keep supporting documentation available for inspection during ordinary business hours.";
    expect(
      isSameObligation(
        makeCandidate({ category: "records_retention", title: "Insurance certificate", description: shared }),
        makeCandidate({ category: "records_retention", title: "Procurement bidding policy", description: shared }),
      ),
    ).toBe(false);
  });

  it("does not merge on an identical generic title when the substance differs", () => {
    // Over-merging is the dangerous direction: it collapses two real deadlines
    // into one and, when their dates differ, suppresses both.
    expect(
      isSameObligation(
        makeCandidate({
          category: "closeout",
          title: "Closeout requirement",
          description: "Any unexpended funds shall be returned within sixty days of the period end.",
        }),
        makeCandidate({
          category: "closeout",
          title: "Closeout requirement",
          description: "A final invoice covering all incurred costs shall be submitted through the portal.",
        }),
      ),
    ).toBe(false);
  });

  it("does not merge a narrative report with a financial report", () => {
    expect(
      isSameObligation(
        makeCandidate({
          category: "reporting",
          title: "Annual narrative report",
          description: "An annual narrative report describing activities and populations served.",
        }),
        makeCandidate({
          category: "reporting",
          title: "Annual financial report",
          description: "An annual financial report presenting actual revenue and expenses.",
        }),
      ),
    ).toBe(false);
  });
});

describe("consolidateCandidates", () => {
  it("returns nothing for no candidates", () => {
    expect(consolidateCandidates([])).toEqual([]);
  });

  it("passes a single candidate through with mergedCount 1", () => {
    const [obligation] = consolidateCandidates([entry({ title: "Annual narrative report" })]);
    expect(obligation.title).toBe("Annual narrative report");
    expect(obligation.mergedCount).toBe(1);
    expect(obligation.dateConflicts).toEqual([]);
  });

  it("collapses duplicate candidates into one obligation", () => {
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report" }),
      entry({ title: "Annual narrative report submission" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].mergedCount).toBe(2);
  });

  it("keeps candidates in different categories as separate obligations", () => {
    const result = consolidateCandidates([
      entry({ category: "reporting", title: "Annual financial report" }),
      entry({ category: "financial", title: "Annual financial report" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("preserves citations from every merged member", () => {
    const result = consolidateCandidates([
      entry(
        { title: "Annual narrative report" },
        { citations: [makeResolvedCitation({ segmentId: "s3", locatorValue: "3", excerpt: "quote A" })] },
      ),
      entry(
        { title: "Annual narrative report submission" },
        { citations: [makeResolvedCitation({ segmentId: "s5", locatorValue: "5", excerpt: "quote B" })] },
      ),
    ]);

    expect(result[0].citations.map((citation) => citation.segmentId).sort()).toEqual(["s3", "s5"]);
  });

  it("de-duplicates identical citations contributed twice", () => {
    const citation = makeResolvedCitation({ segmentId: "s3", excerpt: "the very same quotation" });
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report" }, { citations: [citation] }),
      entry({ title: "Annual narrative report submission" }, { citations: [{ ...citation }] }),
    ]);

    expect(result[0].citations).toHaveLength(1);
  });

  it("orders merged citations by match score and caps them at six", () => {
    const citations = Array.from({ length: 5 }, (_, index) =>
      makeResolvedCitation({
        segmentId: `s${index}`,
        excerpt: `quotation number ${index}`,
        matchScore: index / 10,
      }),
    );
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report" }, { citations: citations.slice(0, 3) }),
      entry({ title: "Annual narrative report submission" }, { citations: citations.slice(3) }),
    ]);

    const scores = result[0].citations.map((citation) => citation.matchScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result[0].citations.length).toBeLessThanOrEqual(6);
  });

  it("keeps the single agreed due date when merged candidates do not disagree", () => {
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report", normalizedDueDate: "2027-04-30" }),
      entry({ title: "Annual narrative report submission", normalizedDueDate: "2027-04-30" }),
    ]);

    expect(result[0].dueDate).toBe("2027-04-30");
    expect(result[0].dateConflicts).toEqual([]);
  });

  it("takes the highest priority present in the group", () => {
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report", priority: "low" }),
      entry({ title: "Annual narrative report submission", priority: "critical" }),
    ]);
    expect(result[0].priority).toBe("critical");
  });

  it("is only as explicit as its weakest contributing claim", () => {
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report", interpretationLevel: "explicit" }),
      entry({ title: "Annual narrative report submission", interpretationLevel: "uncertain" }),
    ]);
    expect(result[0].interpretationLevel).toBe("uncertain");
  });

  it("keeps the longest description of the group", () => {
    const short =
      "The award states: the Grantee shall submit an annual narrative report describing activities, populations served, and accomplishments during the grant period.";
    const long = `${short} The report shall not exceed eight pages.`;

    const result = consolidateCandidates([
      entry({ title: "Annual narrative report", description: short }),
      entry({ title: "Annual narrative report", description: long }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(long);
  });

  it("raises confidence for corroboration but never to certainty", () => {
    const result = consolidateCandidates([
      entry({ title: "Annual narrative report", confidence: 0.8 }),
      entry({ title: "Annual narrative report submission", confidence: 0.9 }),
    ]);
    expect(result[0].confidence).toBeCloseTo(0.95, 10);

    const capped = consolidateCandidates([
      entry({ title: "Annual narrative report", confidence: 0.97 }),
      entry({ title: "Annual narrative report submission", confidence: 0.98 }),
    ]);
    expect(capped[0].confidence).toBe(0.98);
  });

  it("does not inflate confidence for a candidate that stands alone", () => {
    const result = consolidateCandidates([entry({ title: "Annual report", confidence: 0.8 })]);
    expect(result[0].confidence).toBe(0.8);
  });

  it("marks the obligation as critic-origin only when every member came from the critic", () => {
    const allCritic = consolidateCandidates([
      entry({ title: "Annual narrative report" }, { origin: "critic" }),
      entry({ title: "Annual narrative report submission" }, { origin: "critic" }),
    ]);
    expect(allCritic[0].origin).toBe("critic");

    const mixed = consolidateCandidates([
      entry({ title: "Annual narrative report" }, { origin: "critic" }),
      entry({ title: "Annual narrative report submission" }, { origin: "extracted" }),
    ]);
    expect(mixed[0].origin).toBe("extracted");
  });

  it("carries forward the first stated recurrence, owner and consequence", () => {
    const result = consolidateCandidates([
      entry({
        title: "Quarterly programmatic report",
        recurrence: null,
        suggestedOwnerRole: null,
        consequence: null,
      }),
      entry({
        title: "Quarterly programmatic report submission",
        recurrence: "quarterly",
        suggestedOwnerRole: "Grants manager",
        consequence: "The funder may withhold payment.",
      }),
    ]);

    expect(result[0].recurrence).toBe("quarterly");
    expect(result[0].suggestedOwnerRole).toBe("Grants manager");
    expect(result[0].consequence).toBe("The funder may withhold payment.");
  });
});

describe("consolidateCandidates — a contradiction is never silently resolved", () => {
  /**
   * The single most important behaviour in this module. Fixture 05 states three
   * different due dates for the same Final Report. Picking one and moving on
   * would put a wrong deadline in a nonprofit's calendar with no visible sign
   * that the document ever disagreed.
   */
  const conflicting = [
    entry(
      {
        category: "reporting",
        title: "Final report",
        normalizedDueDate: "2027-08-29",
        originalDateText: "no later than sixty (60) days after the end of the Project Period",
      },
      {
        citations: [
          makeResolvedCitation({ segmentId: "s4", locatorType: "section", locatorValue: "5.2" }),
        ],
      },
    ),
    entry(
      {
        category: "reporting",
        title: "Final report delivery",
        normalizedDueDate: "2027-10-15",
        originalDateText: "on or before October 15, 2027",
      },
      {
        citations: [
          makeResolvedCitation({ segmentId: "s9", locatorType: "section", locatorValue: "9.4" }),
        ],
      },
    ),
  ];

  it("stores no due date at all when merged candidates disagree", () => {
    const [obligation] = consolidateCandidates(conflicting);
    expect(obligation.mergedCount).toBe(2);
    expect(obligation.dueDate).toBeNull();
  });

  it("records every competing date as a conflict with its own locator", () => {
    const [obligation] = consolidateCandidates(conflicting);

    expect(obligation.dateConflicts).toHaveLength(2);
    expect(obligation.dateConflicts.map((conflict) => conflict.normalizedDate)).toEqual([
      "2027-08-29",
      "2027-10-15",
    ]);
    expect(obligation.dateConflicts[0].locatorValue).toBe("5.2");
    expect(obligation.dateConflicts[1].locatorValue).toBe("9.4");
    expect(obligation.dateConflicts[0].dateText).toContain("sixty (60) days");
    expect(obligation.dateConflicts[1].dateText).toContain("October 15, 2027");
  });

  it("asks the user which date applies, naming both dates", () => {
    const [obligation] = consolidateCandidates(conflicting);

    expect(obligation.clarificationQuestion).toBeTruthy();
    expect(obligation.clarificationQuestion).toContain("2027-08-29");
    expect(obligation.clarificationQuestion).toContain("2027-10-15");
    expect(obligation.clarificationQuestion).toContain("more than one due date");
  });

  it("overrides any clarification question the model supplied for a conflicted item", () => {
    const [obligation] = consolidateCandidates([
      { ...conflicting[0], candidate: { ...conflicting[0].candidate, clarificationQuestion: "Ignore me." } },
      conflicting[1],
    ]);
    expect(obligation.clarificationQuestion).not.toBe("Ignore me.");
    expect(obligation.clarificationQuestion).toContain("Which date applies?");
  });

  it("names all three dates when a document contradicts itself three ways", () => {
    const [obligation] = consolidateCandidates([
      ...conflicting,
      entry({
        category: "reporting",
        title: "Final report due",
        normalizedDueDate: "2027-09-30",
        originalDateText: "Final report due September 30, 2027",
      }),
    ]);

    expect(obligation.dueDate).toBeNull();
    expect(obligation.dateConflicts).toHaveLength(3);
    for (const date of ["2027-08-29", "2027-10-15", "2027-09-30"]) {
      expect(obligation.clarificationQuestion).toContain(date);
    }
  });

  it("does not raise a conflict when only one member states a date", () => {
    const [obligation] = consolidateCandidates([
      conflicting[0],
      entry({ category: "reporting", title: "Final report delivery", normalizedDueDate: null }),
    ]);

    expect(obligation.dueDate).toBe("2027-08-29");
    expect(obligation.dateConflicts).toEqual([]);
  });

  it("does not raise a conflict when both members state the same date twice", () => {
    const [obligation] = consolidateCandidates([
      conflicting[0],
      entry({ category: "reporting", title: "Final report delivery", normalizedDueDate: "2027-08-29" }),
    ]);

    expect(obligation.dueDate).toBe("2027-08-29");
    expect(obligation.dateConflicts).toEqual([]);
    expect(obligation.clarificationQuestion).toBeNull();
  });

  it("keeps a conflict locator honest when the contributing citation never resolved", () => {
    const [obligation] = consolidateCandidates([
      conflicting[0],
      entry(
        { category: "reporting", title: "Final report delivery", normalizedDueDate: "2027-10-15" },
        { citations: [makeResolvedCitation({ segmentId: null, locatorValue: "" })] },
      ),
    ]);

    expect(obligation.dateConflicts[1].locatorValue).toBe("");
  });

  it("does not merge — and so does not conflict — across differing recurrence", () => {
    const result = consolidateCandidates([
      entry({
        category: "reporting",
        title: "Programmatic report",
        recurrence: "quarterly",
        normalizedDueDate: "2027-01-30",
      }),
      entry({
        category: "reporting",
        title: "Programmatic report",
        recurrence: "annual",
        normalizedDueDate: "2027-09-30",
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].dueDate).toBe("2027-01-30");
    expect(result[1].dueDate).toBe("2027-09-30");
    expect(result.every((obligation) => obligation.dateConflicts.length === 0)).toBe(true);
  });
});
