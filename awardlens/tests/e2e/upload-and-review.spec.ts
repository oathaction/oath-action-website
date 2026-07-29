import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { analyseSample, signIn, uniqueEmail } from "./helpers";

/**
 * The core journey: analyse a document, then review what came out of it.
 *
 * This is the product. Everything else — exports, reminders, the dashboard —
 * is downstream of whether a person can see what was extracted, check it
 * against the source, and take ownership of it.
 *
 * The steps share one browser context because they are one continuous piece of
 * work by one person on one award, and because the free plan allows a single
 * award per organisation.
 */

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let awardId: string;

/**
 * Titles used to take an item over from the extractor and to add one by hand.
 * Both are stamped so they cannot collide with anything the document produced,
 * and so "did this persist?" cannot pass on a coincidence.
 */
const STAMP = Date.now().toString(36);
const EDITED_TITLE = `Countersign and return the agreement, checked ${STAMP}`;
const MANUAL_TITLE = `Send the funder a mid-year variance note ${STAMP}`;

test.beforeAll(async ({ browser }, testInfo) => {
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
  });
  page = await context.newPage();
  await signIn(page, uniqueEmail("review-owner"));
});

test.afterAll(async () => {
  await context?.close();
});

/* ------------------------------------------------------------- utilities -- */

function reviewQueue(): Locator {
  return page.getByRole("list", { name: "Obligations awaiting review" });
}

/**
 * Expands a queue row so its full evidence rail is on screen.
 *
 * Selecting an item scrolls it into view, which can move the row out from under
 * a click that was already in flight, so the select-and-check is retried as a
 * unit rather than assumed to land first time.
 */
async function openQueueItem(index: number): Promise<Locator> {
  const item = reviewQueue().locator("> li").nth(index);

  await expect(async () => {
    if ((await item.getByRole("group").count()) === 0) {
      await item.getByRole("button").first().click();
    }
    await expect(item.getByRole("article")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  return item.getByRole("article");
}

/* ----------------------------------------------------------------- steps -- */

test("analysing the sample shows the real stage checklist and lands on review", async () => {
  test.setTimeout(180_000);

  awardId = await analyseSample(page, { observeProcessing: true });
  expect(awardId).toMatch(/\S/);

  await expect(page).toHaveURL(new RegExp(`/app/awards/${awardId}/review`));
  await expect(
    page.getByRole("heading", { name: "Review what this award requires", level: 1 }),
  ).toBeVisible();
});

test("the review queue holds several obligations drawn from the document", async () => {
  const items = reviewQueue().locator("> li");
  const count = await items.count();

  // The sample agreement states reporting deadlines, a restriction on the use
  // of funds, an acknowledgement requirement and a closeout obligation. A
  // register in low single figures means the extractor has quietly regressed.
  expect(count, "the sample should yield a substantial register").toBeGreaterThanOrEqual(5);

  await expect(page.getByText(/still waiting on you/)).toBeVisible();
});

test("every obligation shows a source citation or says outright that it could not be verified", async () => {
  test.setTimeout(180_000);

  const count = await reviewQueue().locator("> li").count();

  for (let index = 0; index < count; index += 1) {
    const rail = await openQueueItem(index);
    const text = await rail.innerText();
    const title = (await rail.getByRole("heading").first().innerText()).trim();

    // The rail always states where it stands on provenance, in words.
    expect(
      text,
      `"${title}" does not state a source status at all`,
    ).toMatch(/Source verified|Partial source match|Source confirmation needed/);

    const hasCitation = /\bSource: /.test(text);
    const admitsFailure = text.includes(
      "We could not match this item to a passage in your document",
    );

    expect(
      hasCitation || admitsFailure,
      `"${title}" shows neither a source citation nor a source-confirmation-needed state — ` +
        "this is the one thing the product must never do",
    ).toBe(true);

    if (hasCitation) {
      // A citation is only worth anything if the quoted passage is really there.
      const quote = rail.locator("blockquote").first();
      await expect(quote, `"${title}" cites a source but shows no passage`).toBeVisible();
      const quoted = (await quote.innerText()).replace(/[“”"…]/g, "").trim();
      expect(quoted.length, `"${title}" quotes an empty passage`).toBeGreaterThan(20);
    }
  }
});

test("nothing arrives pre-confirmed", async () => {
  const items = reviewQueue().locator("> li");
  const count = await items.count();

  // Every row, expanded or collapsed, carries the same badge.
  await expect(reviewQueue().getByText("Needs review", { exact: true })).toHaveCount(count);

  // The filter chips are the independent tally, straight off the server data.
  await expect(
    page.getByRole("button", { name: "Confirmed 0" }),
    "an item was confirmed without a person deciding anything",
  ).toBeVisible();
  await expect(page.getByRole("button", { name: `Needs review ${count}` })).toBeVisible();
  await expect(page.getByText(/^0 of \d+ reviewed/)).toBeVisible();
});

test("confirming an item changes its status and only its status", async () => {
  const items = reviewQueue().locator("> li");
  const before = await items.count();

  const rail = await openQueueItem(0);
  const title = (await rail.getByRole("heading").first().innerText()).trim();

  await rail.getByRole("button", { name: "Confirm", exact: true }).click();

  await expect(page.getByRole("button", { name: "Confirmed 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Needs review ${before - 1}` })).toBeVisible();
  await expect(page.getByText(/^1 of \d+ reviewed/)).toBeVisible();

  // The item itself now reads as confirmed, and nothing was removed.
  const confirmedRow = reviewQueue().locator("li").filter({ hasText: title });
  await expect(confirmedRow.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await expect(items).toHaveCount(before);
});

test("editing an obligation persists the change across a reload", async () => {
  // Pick something still awaiting a decision, so the edit is the only change.
  await page.getByRole("button", { name: /^Needs review \d+$/ }).click();
  const rail = await openQueueItem(0);
  const originalTitle = (await rail.getByRole("heading").first().innerText()).trim();

  await rail.getByRole("button", { name: "Edit" }).click();

  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("heading", { name: "Edit this requirement" })).toBeVisible();

  // The editor must open on what is actually stored, not on a blank form.
  await expect(editor.getByLabel("Title")).toHaveValue(originalTitle);

  await editor.getByLabel("Title").fill(EDITED_TITLE);
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toBeHidden();

  await page.reload();
  await expect(
    page.getByText(EDITED_TITLE),
    "the edited title did not survive a reload",
  ).toBeVisible();
  await expect(page.getByText(originalTitle, { exact: true })).toHaveCount(0);
});

test("an obligation added by hand is recorded as the user's own, confirmed item", async () => {
  await page.goto(`/app/awards/${awardId}/obligations`);
  await expect(page.getByRole("heading", { name: "Obligation register", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Add an obligation" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add an obligation" })).toBeVisible();

  await dialog.getByLabel("Title").fill(MANUAL_TITLE);
  await dialog
    .getByLabel("What has to happen")
    .fill("Email the programme officer a variance note covering the first six months.");
  await dialog.getByLabel("Category").selectOption({ label: "Reporting" });
  await dialog.getByLabel("Due date (optional)").fill("2026-09-30");
  await dialog.getByRole("button", { name: "Add to the register" }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole("article").filter({ hasText: MANUAL_TITLE });
  await expect(card).toBeVisible();

  // The distinction the register exists to preserve: this is the user's own
  // record, not something AwardLens claims the document says.
  await expect(card.getByText("Added by you")).toBeVisible();
  await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(card.getByText(/Explicit in award|Interpreted|Uncertain/)).toHaveCount(0);
});

test("the register can be searched, filtered by review status, and read as a table", async () => {
  await page.goto(`/app/awards/${awardId}/obligations`);

  const totalCards = await page.getByRole("article").count();
  expect(totalCards).toBeGreaterThanOrEqual(5);

  /* ---------------------------------------------------------------- search */
  await page.getByLabel("Search").fill("variance note");
  await expect(page.getByText(/^1 of \d+ obligations match your filters$/)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").first()).toContainText(MANUAL_TITLE);

  // A search that matches nothing says so rather than silently showing everything.
  await page.getByLabel("Search").fill("zzzz-no-such-requirement");
  await expect(page.getByRole("heading", { name: "No obligations match your filters" })).toBeVisible();

  // The empty state offers its own reset alongside the one in the controls.
  await expect(page.getByRole("button", { name: "Reset filters" })).toHaveCount(2);
  await page.getByRole("button", { name: "Reset filters" }).last().click();
  await expect(page.getByRole("article")).toHaveCount(totalCards);

  /* ------------------------------------------------------ filter by status */
  await page.getByLabel("Review status").selectOption({ label: "Confirmed" });

  const confirmed = page.getByRole("article");
  const confirmedCount = await confirmed.count();
  expect(confirmedCount).toBeGreaterThan(0);
  expect(confirmedCount).toBeLessThan(totalCards);

  for (let index = 0; index < confirmedCount; index += 1) {
    await expect(
      confirmed.nth(index).getByText("Confirmed", { exact: true }),
      "the status filter returned an item that is not confirmed",
    ).toBeVisible();
  }

  await page.getByLabel("Review status").selectOption({ label: "Needs review" });
  const needsReview = page.getByRole("article");
  const needsReviewCount = await needsReview.count();
  expect(confirmedCount + needsReviewCount).toBe(totalCards);

  await page.getByRole("button", { name: "Reset filters" }).first().click();

  /* ------------------------------------------------------------ table view */
  await page.getByRole("button", { name: "Table" }).click();

  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  for (const column of ["Title", "Category", "Due", "Priority", "Status", "Source"]) {
    await expect(table.getByRole("columnheader", { name: new RegExp(`^${column}`) })).toBeVisible();
  }

  // Same data, different shape: one row per obligation, still stating provenance.
  await expect(table.getByRole("row")).toHaveCount(totalCards + 1);
  await expect(table.getByRole("cell", { name: "Added by you" })).toBeVisible();

  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page.getByRole("article")).toHaveCount(totalCards);
});
