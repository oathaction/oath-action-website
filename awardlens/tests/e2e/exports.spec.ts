import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { analyseSample, signIn, uniqueEmail } from "./helpers";

/**
 * The exports.
 *
 * An export is the point at which AwardLens's output leaves AwardLens, so the
 * honesty of the register has to survive the trip: the CSV must carry its
 * disclaimer, the JSON must keep review state and provenance, and the calendar
 * must contain only what a person actually signed off on. A diary full of
 * machine guesses presented as settled deadlines is the failure mode.
 */

/* -------------------------------------------------------------- utilities -- */

/** Undoes RFC 5545 line folding and text escaping so content can be matched. */
function readIcs(raw: string): string {
  return raw
    .replace(/\r\n /g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\([,;\\])/g, "$1");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const CSV_HEADER_ROW =
  "Title,Category,Description,Due date,Original date wording,Recurrence,Start work by," +
  "Suggested owner,Priority,Review status,Basis,Confidence,Source status,Source locations," +
  "Source excerpt,Consequence,Question for funder,Notes";

/* ------------------------------------------- an award with a confirmed date -- */

test.describe.configure({ mode: "serial" });

test.describe("exports from an award with one confirmed, dated obligation", () => {
  let context: BrowserContext;
  let page: Page;
  let awardId: string;
  let confirmedTitle: string;
  let unconfirmedTitle: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);

    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport ?? undefined,
    });
    page = await context.newPage();

    await signIn(page, uniqueEmail("exports-owner"));
    awardId = await analyseSample(page);

    await page.goto(`/app/awards/${awardId}/obligations`);

    // Narrow to requirements that actually carry a calendar date — those are
    // the only ones a calendar export can legitimately contain.
    await page.getByLabel("Due date").selectOption({ label: "Has a date" });

    const dated = page.getByRole("article");
    expect(
      await dated.count(),
      "the sample should produce at least two dated requirements",
    ).toBeGreaterThanOrEqual(2);

    confirmedTitle = (await dated.nth(0).getByRole("heading").first().innerText()).trim();

    // Confirmed through the register the way a person would, not by writing to
    // the store: the export has to reflect a real review decision.
    await dated.nth(0).getByRole("button", { name: /^Confirm/ }).click();

    const confirmedCard = page.getByRole("article").filter({ hasText: confirmedTitle });
    await expect(confirmedCard.getByText("Confirmed", { exact: true })).toBeVisible();

    /*
     * The counter-example for the calendar assertions has to be a dated item
     * that is unconfirmed *and* whose title is not shared with anything
     * confirmed. Titles come from the document's own wording, so two
     * requirements can legitimately carry the same one — picking the second row
     * blind would eventually assert that a string is absent from the calendar
     * while a confirmed item legitimately puts it there.
     */
    const stored = JSON.parse(
      await (await page.request.get(`/api/awards/${awardId}/export/json`)).text(),
    );

    interface StoredObligation {
      title: string;
      dueDate: string | null;
      reviewStatus: string;
    }

    const confirmedTitles = new Set(
      stored.obligations
        .filter((item: StoredObligation) => item.reviewStatus === "confirmed")
        .map((item: StoredObligation) => item.title),
    );

    expect(confirmedTitles.size, "exactly one item should have been confirmed").toBe(1);

    const counterExample = stored.obligations.find(
      (item: StoredObligation) =>
        item.dueDate !== null &&
        item.reviewStatus !== "confirmed" &&
        !confirmedTitles.has(item.title),
    ) as StoredObligation | undefined;

    expect(
      counterExample,
      "the sample needs a second, distinctly titled dated requirement to test against",
    ).toBeDefined();
    unconfirmedTitle = counterExample!.title;
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("the CSV carries a header row and the verification disclaimer", async () => {
    const response = await page.request.get(`/api/awards/${awardId}/export/csv`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("attachment");

    const csv = await response.text();
    const lines = csv.split("\r\n");

    expect(
      lines,
      "the CSV has lost its column headers",
    ).toContain(CSV_HEADER_ROW);

    expect(
      csv,
      "the CSV left AwardLens without telling the reader it must be verified",
    ).toContain("must be verified against the award document");
    expect(csv).toContain("does not provide legal, accounting or compliance advice");

    // The register itself, not just a preamble.
    const headerIndex = lines.indexOf(CSV_HEADER_ROW);
    expect(lines.length - headerIndex - 1).toBeGreaterThanOrEqual(5);

    // Review state travels with every row, so nothing reads as settled by default.
    expect(csv).toContain("Needs review");
    expect(csv).toContain("Confirmed");
  });

  test("the CSV neutralises spreadsheet formula injection", async () => {
    // Award documents contain text we did not write; a cell starting `=` is
    // executed on open by Excel and Sheets.
    const csv = await (await page.request.get(`/api/awards/${awardId}/export/csv`)).text();

    for (const cell of csv.split(/\r\n|,/)) {
      const value = cell.replace(/^"|"$/g, "");
      expect(
        value.startsWith("=") || value.startsWith("@"),
        `a CSV cell begins with a formula character: ${value.slice(0, 40)}`,
      ).toBe(false);
    }
  });

  test("the ICS is a well-formed calendar containing only the confirmed item", async () => {
    const response = await page.request.get(`/api/awards/${awardId}/export/ics`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");

    const raw = await response.text();
    expect(raw.startsWith("BEGIN:VCALENDAR"), "the ICS does not open a calendar").toBe(true);
    expect(raw.trimEnd().endsWith("END:VCALENDAR"), "the ICS does not close a calendar").toBe(true);

    const ics = readIcs(raw);
    expect(countOccurrences(ics, "BEGIN:VEVENT")).toBe(countOccurrences(ics, "END:VEVENT"));
    expect(countOccurrences(ics, "BEGIN:VEVENT")).toBeGreaterThanOrEqual(1);

    // The confirmed item is in the calendar…
    expect(ics, "the confirmed obligation is missing from the calendar").toContain(
      confirmedTitle,
    );
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
    expect(ics).toContain("STATUS:CONFIRMED");

    // …and a dated item nobody has confirmed is not.
    expect(
      ics,
      "an unconfirmed requirement was written into somebody's calendar as if it were settled",
    ).not.toContain(unconfirmedTitle);
    expect(ics).not.toContain("NOT YET CONFIRMED");
  });

  test("the JSON export is self-describing and keeps review state and provenance", async () => {
    const response = await page.request.get(`/api/awards/${awardId}/export/json`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const payload = JSON.parse(await response.text());

    expect(payload.formatVersion).toBe(1);
    expect(payload.generatedAt).toEqual(expect.any(String));
    expect(payload.disclaimer).toContain("not been verified by a person");
    expect(payload.disclaimer).toContain("does not provide legal, accounting, tax or compliance advice");

    expect(payload.award).toBeTruthy();
    expect(payload.award.name).toEqual(expect.any(String));
    expect(payload.award.name.length).toBeGreaterThan(0);

    expect(Array.isArray(payload.obligations)).toBe(true);
    expect(payload.obligations.length).toBeGreaterThanOrEqual(5);

    for (const obligation of payload.obligations) {
      expect(
        obligation.reviewStatus,
        `obligation "${obligation.title}" exported without a review status`,
      ).toMatch(/^(needs_review|confirmed|needs_clarification|not_applicable|archived)$/);

      expect(
        Array.isArray(obligation.citations),
        `obligation "${obligation.title}" exported without a citations array`,
      ).toBe(true);

      expect(obligation.sourceStatus).toMatch(/^(verified|partial|unverified)$/);
      expect(obligation.origin).toMatch(/^(extracted|manual)$/);

      for (const citation of obligation.citations) {
        expect(citation.locatorType).toMatch(/^(page|section|paragraph)$/);
        expect(citation.excerpt).toEqual(expect.any(String));
        expect(typeof citation.verified).toBe("boolean");
      }
    }

    // The one item a person signed off on is recorded as such, and it is the
    // only one — the export is not quietly upgrading anything.
    const confirmed = payload.obligations.filter(
      (item: { reviewStatus: string }) => item.reviewStatus === "confirmed",
    );
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].title).toBe(confirmedTitle);
  });

  test("an unsupported export format is refused", async () => {
    const response = await page.request.get(`/api/awards/${awardId}/export/pdf`);
    expect(response.status()).toBe(400);
  });
});

/* ------------------------------------------------- an award with nothing done -- */

test("the calendar of an unreviewed award contains no events at all", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
  });
  const page = await context.newPage();

  try {
    await signIn(page, uniqueEmail("exports-untouched"));
    const awardId = await analyseSample(page);

    // Nothing has been confirmed. The register is full of dated requirements…
    const json = JSON.parse(
      await (await page.request.get(`/api/awards/${awardId}/export/json`)).text(),
    );
    const dated = json.obligations.filter((item: { dueDate: string | null }) => item.dueDate);
    expect(dated.length, "the sample should contain dated requirements").toBeGreaterThan(0);
    expect(
      json.obligations.every(
        (item: { reviewStatus: string }) => item.reviewStatus === "needs_review",
      ),
    ).toBe(true);

    // …and the calendar is still empty, because a person has not agreed to any
    // of them yet. This is the whole reason the calendar export exists.
    const raw = await (await page.request.get(`/api/awards/${awardId}/export/ics`)).text();
    expect(raw.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(raw.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(
      raw,
      "unconfirmed requirements were exported into a calendar",
    ).not.toContain("BEGIN:VEVENT");

    // The CSV, by contrast, is deliberately complete — it is a register, not a
    // diary — and every row says it has not been reviewed.
    const csv = await (await page.request.get(`/api/awards/${awardId}/export/csv`)).text();
    expect(csv).toContain("Needs review");
  } finally {
    await context.close();
  }
});
