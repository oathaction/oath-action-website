import { describe, expect, it } from "vitest";

import { escapeCsvCell, obligationsToCsv, toCsv } from "@/lib/exports/csv";

import { makeAward, makeObligation, makeStoredCitation } from "./_helpers/factories";

describe("escapeCsvCell — RFC 4180 quoting", () => {
  it("leaves an ordinary value untouched", () => {
    expect(escapeCsvCell("Annual report")).toBe("Annual report");
  });

  it("renders null and undefined as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("renders numbers and booleans as their string form", () => {
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(0.88)).toBe("0.88");
    expect(escapeCsvCell(false)).toBe("false");
  });

  it("quotes a cell containing a comma", () => {
    expect(escapeCsvCell("Reports, budgets and audits")).toBe(
      '"Reports, budgets and audits"',
    );
  });

  it("quotes a cell containing a newline", () => {
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("doubles embedded double quotes and wraps the cell", () => {
    expect(escapeCsvCell('He said "no later than April 30".')).toBe(
      '"He said ""no later than April 30""."',
    );
  });

  it("doubles every quote, not just the first", () => {
    expect(escapeCsvCell('"a" and "b"')).toBe('"""a"" and ""b"""');
  });
});

describe("escapeCsvCell — spreadsheet formula injection is neutralised", () => {
  // Award documents contain text we did not author. Excel and Sheets execute a
  // leading =, +, -, @, tab or CR as a formula on open.
  it.each([
    ["=", "=1+1+cmd|' /C calc'!A0"],
    ["+", "+1+1"],
    ["-", "-2+3+cmd|' /C notepad'!A1"],
    ["@", "@SUM(1+9)*cmd|' /C calc'!A0"],
  ])("prefixes a cell beginning with %s with an apostrophe", (_prefix, payload) => {
    const escaped = escapeCsvCell(payload);
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped).toBe(`'${payload}`);
  });

  it("neutralises a leading tab character", () => {
    expect(escapeCsvCell("\t=1+1")).toBe("'\t=1+1");
  });

  it("neutralises a leading carriage return and then quotes the cell", () => {
    // The CR also triggers RFC 4180 quoting, so the apostrophe sits inside.
    expect(escapeCsvCell("\r=1+1")).toBe('"\'\r=1+1"');
  });

  it("neutralises a formula that also needs quoting", () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"',
    );
  });

  it("does not neutralise a formula character that is not leading", () => {
    expect(escapeCsvCell("Budget = 75000")).toBe("Budget = 75000");
    expect(escapeCsvCell("Contact us @ noon")).toBe("Contact us @ noon");
  });

  it("also prefixes a genuine negative number, which is the accepted cost of the control", () => {
    expect(escapeCsvCell("-75000")).toBe("'-75000");
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe("a,b\r\nc,d");
  });

  it("does not append a trailing line break", () => {
    expect(toCsv([["a"]])).toBe("a");
  });

  it("emits an empty line for an empty row", () => {
    expect(toCsv([["a"], [], ["b"]])).toBe("a\r\n\r\nb");
  });

  it("escapes every cell it joins", () => {
    expect(toCsv([["=1+1", "has, comma"]])).toBe("'=1+1,\"has, comma\"");
  });

  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("obligationsToCsv", () => {
  const award = makeAward({
    name: "Community Housing Grant",
    funder: "Whitfield Family Foundation",
    awardNumber: "WFF-2026-0417",
    startDate: "2026-03-01",
    endDate: "2027-02-28",
  });

  function lines(csv: string): string[] {
    return csv.split("\r\n");
  }

  it("opens with a title row naming the award", () => {
    const rows = lines(obligationsToCsv(award, []));
    expect(rows[0]).toBe("AwardLens obligation register — Community Housing Grant");
  });

  it("states the funder, award number and period on the second row", () => {
    const rows = lines(obligationsToCsv(award, []));
    expect(rows[1]).toBe(
      "Funder: Whitfield Family Foundation,Award number: WFF-2026-0417,Period: 2026-03-01 to 2027-02-28",
    );
  });

  it("falls back to explicit placeholders for missing award details", () => {
    const rows = lines(
      obligationsToCsv(
        makeAward({ funder: null, awardNumber: null, startDate: null, endDate: null }),
        [],
      ),
    );
    expect(rows[1]).toContain("Funder: Not stated");
    expect(rows[1]).toContain("Award number: Not stated");
    expect(rows[1]).toContain("Period: ? to ?");
  });

  it("includes a verification disclaimer row before the data", () => {
    const rows = lines(obligationsToCsv(award, []));
    expect(rows[2]).toContain("must be verified against the award document");
    expect(rows[2]).toContain("does not provide legal, accounting or compliance advice");
    // Contains commas, so it must be a single quoted cell.
    expect(rows[2].startsWith('"')).toBe(true);
  });

  it("includes the header row with every documented column", () => {
    const rows = lines(obligationsToCsv(award, []));
    expect(rows[3]).toBe("");
    expect(rows[4].split(",")).toEqual([
      "Title",
      "Category",
      "Description",
      "Due date",
      "Original date wording",
      "Recurrence",
      "Start work by",
      "Suggested owner",
      "Priority",
      "Review status",
      "Basis",
      "Confidence",
      "Source status",
      "Source locations",
      "Source excerpt",
      "Consequence",
      "Question for funder",
      "Notes",
    ]);
  });

  it("writes one row per obligation with human-readable labels", () => {
    const csv = obligationsToCsv(award, [
      makeObligation({
        title: "Annual report",
        category: "reporting",
        description: "Submit the annual report through the portal.",
        originalDateText: "no later than 2027-04-30",
        dueDate: "2027-04-30",
        recurrence: null,
        internalDueDate: "2027-04-09",
        suggestedOwnerRole: "Grants manager",
        priority: "high",
        reviewStatus: "needs_review",
        interpretationLevel: "light_interpretation",
        sourceStatus: "partial",
        confidence: 0.8,
        citations: [],
      }),
    ]);
    // No cell in this fixture contains a comma, so a naive split is safe here.
    const row = lines(csv)[5].split(",");

    expect(row[0]).toBe("Annual report");
    expect(row[1]).toBe("Reporting");
    expect(row[2]).toBe("Submit the annual report through the portal.");
    expect(row[3]).toBe("2027-04-30");
    expect(row[4]).toBe("no later than 2027-04-30");
    expect(row[5]).toBe("");
    expect(row[6]).toBe("2027-04-09");
    expect(row[7]).toBe("Grants manager");
    expect(row[8]).toBe("high");
    expect(row[9]).toBe("Needs review");
    expect(row[10]).toBe("Interpreted");
    expect(row[11]).toBe("0.80");
    expect(row[12]).toBe("Partial source match");
  });

  it("lists short locators only for citations that resolved to a stored segment", () => {
    const csv = obligationsToCsv(award, [
      makeObligation({
        citations: [
          makeStoredCitation({ documentSegmentId: "seg-1", locatorType: "page", locatorValue: "3" }),
          makeStoredCitation({
            id: "cit-2",
            documentSegmentId: null,
            locatorType: "page",
            locatorValue: "9",
          }),
          makeStoredCitation({
            id: "cit-3",
            documentSegmentId: "seg-2",
            locatorType: "section",
            locatorValue: "5",
          }),
        ],
      }),
    ]);

    expect(csv).toContain(",p.3; §5,");
    expect(csv).not.toContain("p.9");
  });

  it("leaves the locator cell empty when no citation resolved", () => {
    const csv = obligationsToCsv(award, [
      makeObligation({ citations: [makeStoredCitation({ documentSegmentId: null })] }),
    ]);
    const cells = lines(csv)[5];
    expect(cells).not.toContain("p.3");
  });

  it("neutralises a formula smuggled into an obligation title", () => {
    const csv = obligationsToCsv(award, [
      makeObligation({ title: '=cmd|\' /C calc\'!A0', citations: [] }),
    ]);
    expect(lines(csv)[5].startsWith("'=cmd")).toBe(true);
  });

  it("neutralises a formula smuggled into a description quoted from the document", () => {
    const csv = obligationsToCsv(award, [
      makeObligation({ description: "@SUM(A1:A9)", citations: [] }),
    ]);
    expect(csv).toContain(",'@SUM(A1:A9),");
  });

  it("produces only the header block when there are no obligations", () => {
    expect(lines(obligationsToCsv(award, []))).toHaveLength(5);
  });
});
