import { describe, expect, it } from "vitest";

import { escapeIcsText, foldIcsLine, obligationsToIcs } from "@/lib/exports/ics";

import { makeAward, makeObligation, makeStoredCitation } from "./_helpers/factories";

const STAMP = "20260301T000000Z";

function physicalLines(ics: string): string[] {
  return ics.split("\r\n");
}

/** Unfolds RFC 5545 continuation lines back into logical content lines. */
function logicalLines(ics: string): string[] {
  const out: string[] = [];
  for (const line of physicalLines(ics)) {
    if (line.startsWith(" ") && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

describe("escapeIcsText", () => {
  it("leaves plain text alone", () => {
    expect(escapeIcsText("Annual report")).toBe("Annual report");
  });

  it("escapes semicolons", () => {
    expect(escapeIcsText("a;b")).toBe("a\\;b");
  });

  it("escapes commas", () => {
    expect(escapeIcsText("April 30, 2027")).toBe("April 30\\, 2027");
  });

  it("escapes newlines as a literal \\n", () => {
    expect(escapeIcsText("line one\nline two")).toBe("line one\\nline two");
    expect(escapeIcsText("line one\r\nline two")).toBe("line one\\nline two");
  });

  it("escapes backslashes first so an escape is never double-processed", () => {
    // A single backslash must become exactly two, not four.
    expect(escapeIcsText("path\\to")).toBe("path\\\\to");
    expect(escapeIcsText("a\\;b")).toBe("a\\\\\\;b");
  });

  it("escapes a value that mixes every special character", () => {
    expect(escapeIcsText("x\\y;z,w\nv")).toBe("x\\\\y\\;z\\,w\\nv");
  });
});

describe("foldIcsLine", () => {
  it("leaves a line of 75 octets or fewer unchanged", () => {
    const line = "A".repeat(75);
    expect(foldIcsLine(line)).toBe(line);
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds a longer line with CRLF plus a single leading space", () => {
    const folded = foldIcsLine("A".repeat(200));
    expect(folded).toContain("\r\n ");
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    expect(parts[1].startsWith(" ")).toBe(true);
  });

  it("keeps every physical line within 75 octets", () => {
    for (const line of foldIcsLine("B".repeat(1000)).split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("round-trips to the original content when unfolded", () => {
    const original = `DESCRIPTION:${"word ".repeat(60).trim()}`;
    const unfolded = foldIcsLine(original)
      .split("\r\n")
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join("");
    expect(unfolded).toBe(original);
  });

  it("never splits a multi-byte UTF-8 character", () => {
    const original = "é".repeat(120);
    const folded = foldIcsLine(original);

    expect(folded).not.toContain("�");
    const unfolded = folded
      .split("\r\n")
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join("");
    expect(unfolded).toBe(original);
    expect([...unfolded].every((character) => character === "é")).toBe(true);
  });

  it("never splits a 4-byte character such as an emoji", () => {
    const original = `SUMMARY:${"🏛️".repeat(40)}`;
    const folded = foldIcsLine(original);
    expect(folded).not.toContain("�");
    const unfolded = folded
      .split("\r\n")
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join("");
    expect(unfolded).toBe(original);
  });

  it("respects the 75-octet budget in bytes, not characters", () => {
    // 40 two-byte characters is 80 octets even though it is only 40 characters.
    const folded = foldIcsLine("é".repeat(40));
    expect(folded).toContain("\r\n ");
    for (const line of folded.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });
});

describe("obligationsToIcs", () => {
  const award = makeAward({ name: "Community Housing Grant", endDate: "2027-02-28" });

  const confirmed = makeObligation({
    id: "ob-confirmed",
    title: "Annual report",
    dueDate: "2027-04-30",
    internalDueDate: null,
    reviewStatus: "confirmed",
  });

  it("emits a well-formed calendar wrapper", () => {
    const lines = logicalLines(obligationsToIcs(award, [confirmed], { stamp: STAMP }));

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//AwardLens//Obligation Register//EN");
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("names the calendar after the award with ICS escaping applied", () => {
    const ics = obligationsToIcs(makeAward({ name: "Grant, Phase 2" }), [], { stamp: STAMP });
    expect(logicalLines(ics)).toContain("X-WR-CALNAME:Grant\\, Phase 2 — deadlines");
  });

  it("uses the injected stamp so output is deterministic", () => {
    const ics = obligationsToIcs(award, [confirmed], { stamp: STAMP });
    expect(ics).toContain(`DTSTAMP:${STAMP}`);
    expect(ics).toBe(obligationsToIcs(award, [confirmed], { stamp: STAMP }));
  });

  it("includes only confirmed obligations by default", () => {
    const ics = obligationsToIcs(
      award,
      [
        confirmed,
        makeObligation({ id: "ob-review", title: "Needs review item", reviewStatus: "needs_review" }),
      ],
      { stamp: STAMP },
    );

    expect(ics).toContain("Annual report");
    expect(ics).not.toContain("Needs review item");
  });

  it("includes unconfirmed obligations when the caller opts in", () => {
    const ics = obligationsToIcs(
      award,
      [makeObligation({ id: "ob-review", title: "Needs review item", reviewStatus: "needs_review" })],
      { stamp: STAMP, includeUnconfirmed: true },
    );

    expect(ics).toContain("Needs review item");
    expect(ics).toContain("STATUS:TENTATIVE");
  });

  it("never includes a not-applicable or archived obligation, even with includeUnconfirmed", () => {
    const ics = obligationsToIcs(
      award,
      [
        makeObligation({ id: "ob-na", title: "Not applicable item", reviewStatus: "not_applicable" }),
        makeObligation({ id: "ob-arc", title: "Archived item", reviewStatus: "archived" }),
      ],
      { stamp: STAMP, includeUnconfirmed: true },
    );

    expect(ics).not.toContain("Not applicable item");
    expect(ics).not.toContain("Archived item");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("skips an obligation with no due date — a calendar entry needs a date", () => {
    const ics = obligationsToIcs(
      award,
      [makeObligation({ id: "ob-undated", title: "Undated duty", dueDate: null })],
      { stamp: STAMP, includeUnconfirmed: true },
    );
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("marks a confirmed obligation STATUS:CONFIRMED", () => {
    const lines = logicalLines(obligationsToIcs(award, [confirmed], { stamp: STAMP }));
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).not.toContain("STATUS:TENTATIVE");
  });

  it("marks an unconfirmed obligation STATUS:TENTATIVE and says so in the description", () => {
    const ics = obligationsToIcs(
      award,
      [makeObligation({ id: "ob-x", reviewStatus: "needs_clarification", internalDueDate: null })],
      { stamp: STAMP, includeUnconfirmed: true },
    );

    expect(logicalLines(ics)).toContain("STATUS:TENTATIVE");
    expect(ics.replace(/\r\n /g, "")).toContain("NOT YET CONFIRMED");
  });

  it("emits an all-day event whose DTEND is the day after DTSTART", () => {
    const lines = logicalLines(obligationsToIcs(award, [confirmed], { stamp: STAMP }));
    expect(lines).toContain("DTSTART;VALUE=DATE:20270430");
    expect(lines).toContain("DTEND;VALUE=DATE:20270501");
  });

  it("rolls DTEND into the next month correctly at a month boundary", () => {
    const lines = logicalLines(
      obligationsToIcs(award, [makeObligation({ dueDate: "2027-02-28", internalDueDate: null })], {
        stamp: STAMP,
      }),
    );
    expect(lines).toContain("DTSTART;VALUE=DATE:20270228");
    expect(lines).toContain("DTEND;VALUE=DATE:20270301");
  });

  it("handles a leap day correctly", () => {
    const lines = logicalLines(
      obligationsToIcs(award, [makeObligation({ dueDate: "2028-02-29", internalDueDate: null })], {
        stamp: STAMP,
      }),
    );
    expect(lines).toContain("DTEND;VALUE=DATE:20280301");
  });

  it("emits a separate internal preparation VEVENT with its own UID", () => {
    const ics = obligationsToIcs(
      award,
      [makeObligation({ id: "ob-1", dueDate: "2027-04-30", internalDueDate: "2027-04-09" })],
      { stamp: STAMP },
    );
    const lines = logicalLines(ics);

    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines).toContain("UID:ob-1-0@awardlens");
    expect(lines).toContain("UID:ob-1-prep@awardlens");
    expect(lines).toContain("DTSTART;VALUE=DATE:20270409");
    expect(lines).toContain("DTEND;VALUE=DATE:20270410");
    expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Start work: Annual report");
  });

  it("marks the preparation event tentative even for a confirmed obligation", () => {
    const lines = logicalLines(
      obligationsToIcs(
        award,
        [makeObligation({ id: "ob-1", internalDueDate: "2027-04-09", reviewStatus: "confirmed" })],
        { stamp: STAMP },
      ),
    );
    expect(lines.filter((line) => line === "STATUS:CONFIRMED")).toHaveLength(1);
    expect(lines.filter((line) => line === "STATUS:TENTATIVE")).toHaveLength(1);
  });

  it("omits the preparation event when there is no internal due date", () => {
    const ics = obligationsToIcs(award, [confirmed], { stamp: STAMP });
    expect(ics).not.toContain("-prep@awardlens");
  });

  it("expands a recurring obligation into one VEVENT per occurrence", () => {
    const ics = obligationsToIcs(
      makeAward({ endDate: "2027-09-30" }),
      [
        makeObligation({
          id: "ob-q",
          title: "Quarterly report",
          dueDate: "2027-01-30",
          recurrence: "quarterly",
          internalDueDate: null,
        }),
      ],
      { stamp: STAMP },
    );
    const lines = logicalLines(ics);

    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(4);
    expect(lines).toContain("DTSTART;VALUE=DATE:20270130");
    expect(lines).toContain("DTSTART;VALUE=DATE:20270430");
    expect(lines).toContain("DTSTART;VALUE=DATE:20270730");
    expect(lines).toContain("DTSTART;VALUE=DATE:20271030");
  });

  it("gives each occurrence of a recurring obligation a distinct UID", () => {
    const lines = logicalLines(
      obligationsToIcs(
        makeAward({ endDate: "2027-09-30" }),
        [
          makeObligation({
            id: "ob-q",
            dueDate: "2027-01-30",
            recurrence: "quarterly",
            internalDueDate: null,
          }),
        ],
        { stamp: STAMP },
      ),
    );

    const uids = lines.filter((line) => line.startsWith("UID:"));
    expect(uids).toEqual([
      "UID:ob-q-0@awardlens",
      "UID:ob-q-1@awardlens",
      "UID:ob-q-2@awardlens",
      "UID:ob-q-3@awardlens",
    ]);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("emits exactly one preparation event for a whole recurring series", () => {
    const lines = logicalLines(
      obligationsToIcs(
        makeAward({ endDate: "2027-09-30" }),
        [
          makeObligation({
            id: "ob-q",
            dueDate: "2027-01-30",
            recurrence: "quarterly",
            internalDueDate: "2027-01-09",
          }),
        ],
        { stamp: STAMP },
      ),
    );
    expect(lines.filter((line) => line.endsWith("-prep@awardlens"))).toHaveLength(1);
  });

  it("cites resolved source locators in the description", () => {
    const ics = obligationsToIcs(
      award,
      [
        makeObligation({
          citations: [
            makeStoredCitation({ documentSegmentId: "seg-1", locatorType: "page", locatorValue: "3" }),
            makeStoredCitation({
              id: "c2",
              documentSegmentId: "seg-2",
              locatorType: "section",
              locatorValue: "5",
            }),
          ],
          internalDueDate: null,
        }),
      ],
      { stamp: STAMP },
    );
    expect(ics.replace(/\r\n /g, "")).toContain("Source: Page 3\\, Section 5");
  });

  it("says confirmation is needed when no citation resolved to a segment", () => {
    const ics = obligationsToIcs(
      award,
      [
        makeObligation({
          citations: [makeStoredCitation({ documentSegmentId: null })],
          internalDueDate: null,
        }),
      ],
      { stamp: STAMP },
    );
    expect(ics.replace(/\r\n /g, "")).toContain("Source: confirmation needed");
  });

  it("includes the app link only when one is supplied", () => {
    const withLink = obligationsToIcs(award, [confirmed], {
      stamp: STAMP,
      appUrl: "https://awardlens.test/a/1",
    });
    expect(withLink.replace(/\r\n /g, "")).toContain("Open in AwardLens: https://awardlens.test/a/1");
    expect(obligationsToIcs(award, [confirmed], { stamp: STAMP })).not.toContain("Open in AwardLens");
  });

  it("escapes commas in the summary so a title cannot break the ICS grammar", () => {
    const ics = obligationsToIcs(
      award,
      [makeObligation({ title: "Report, final; version", internalDueDate: null })],
      { stamp: STAMP },
    );
    expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Report\\, final\\; version — Community Housing Grant");
  });

  it("folds every physical line to at most 75 octets", () => {
    const ics = obligationsToIcs(
      award,
      [
        makeObligation({
          description:
            "The Grantee shall submit a single annual report to the Foundation covering the populations served, significant accomplishments, challenges encountered, and any material changes in strategy or leadership during the Grant Period.",
        }),
      ],
      { stamp: STAMP },
    );

    for (const line of physicalLines(ics)) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("produces a calendar with no events when given no obligations", () => {
    const lines = logicalLines(obligationsToIcs(award, [], { stamp: STAMP }));
    expect(lines).not.toContain("BEGIN:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });
});
