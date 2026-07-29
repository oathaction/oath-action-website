import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { analyseSample, signIn, uniqueEmail } from "./helpers";

/**
 * Deletion.
 *
 * "You can delete the document, and everything extracted from it, at any time"
 * is a promise made on the upload screen, so it has to be true in both of its
 * halves: deleting the source document must leave the reviewed register intact
 * and say plainly what has been lost, and deleting the award must actually take
 * everything with it.
 */

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let awardId: string;
let obligationCount: number;
let sampleTitle: string;

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
  });
  page = await context.newPage();

  await signIn(page, uniqueEmail("deletion-owner"));
  awardId = await analyseSample(page);

  const owned = JSON.parse(
    await (await page.request.get(`/api/awards/${awardId}/export/json`)).text(),
  );
  obligationCount = owned.obligations.length;
  sampleTitle = owned.obligations[0].title;
  expect(obligationCount).toBeGreaterThan(0);
});

test.afterAll(async () => {
  await context?.close();
});

test("the source document can be deleted while the register survives", async () => {
  await page.goto(`/app/awards/${awardId}`);

  // Before: the stored file is listed, and re-analysis is possible.
  await expect(page.getByText("sample-foundation-grant.txt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-analyse the document" })).toBeVisible();

  await page.getByRole("button", { name: "Delete the stored document" }).click();

  // It asks first, and says what will be lost.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete the stored document?" })).toBeVisible();
  await expect(
    dialog.getByText(/Your obligation register stays, but the source passages/),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Delete document" }).click();
  await expect(dialog).toBeHidden();

  // After: the panel reports the loss in words rather than going blank…
  await expect(
    page.getByText(
      "The source document has been deleted. Obligations remain, but source passages can no longer be opened.",
    ),
  ).toBeVisible();
  await expect(page.getByText("sample-foundation-grant.txt")).toHaveCount(0);

  // …re-analysis is no longer offered, because there is nothing to re-read…
  await expect(page.getByRole("button", { name: "Re-analyse the document" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete the stored document" })).toHaveCount(0);

  // …and the register is untouched.
  await page.goto(`/app/awards/${awardId}/obligations`);
  await expect(page.getByRole("article")).toHaveCount(obligationCount);
  await expect(page.getByText(sampleTitle, { exact: true }).first()).toBeVisible();

  const stillThere = JSON.parse(
    await (await page.request.get(`/api/awards/${awardId}/export/json`)).text(),
  );
  expect(stillThere.obligations).toHaveLength(obligationCount);
  expect(stillThere.documents).toHaveLength(0);
});

test("the review screen admits it has no stored text to compare against", async () => {
  await page.goto(`/app/awards/${awardId}/review`);

  // The dangerous failure would be a source panel that silently shows nothing.
  await expect(page.getByText("No stored text for this award")).toBeVisible();
  await expect(
    page.getByText(/Check the document against the award yourself before relying on anything/),
  ).toBeVisible();

  // The obligations are still reviewable.
  await expect(page.getByRole("list", { name: "Obligations awaiting review" })).toBeVisible();
});

test("deleting the award requires typing the word, then removes it everywhere", async () => {
  await page.goto(`/app/awards/${awardId}`);
  await page.getByRole("button", { name: "Delete this award" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete this award?" })).toBeVisible();
  await expect(dialog.getByText(/It cannot be undone/)).toBeVisible();

  const confirmButton = dialog.getByRole("button", { name: "Delete permanently" });

  // Guarded: an empty box, and a near-miss, both leave it disabled.
  await expect(confirmButton).toBeDisabled();
  await dialog.getByLabel(/Type delete to confirm/).fill("DELETE");
  await expect(confirmButton, "a case-insensitive match should not unlock deletion").toBeDisabled();
  await dialog.getByLabel(/Type delete to confirm/).fill("delete please");
  await expect(confirmButton).toBeDisabled();

  await dialog.getByLabel(/Type delete to confirm/).fill("delete");
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  // It lands back on the dashboard, which is empty again.
  await page.waitForURL(/\/app$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to");
  await expect(page.getByText(sampleTitle)).toHaveCount(0);

  // And the award is genuinely gone, not merely hidden.
  const response = await page.goto(`/app/awards/${awardId}`);
  expect(response?.status(), "a deleted award still resolves").toBe(404);
  await expect(page.getByRole("heading", { name: /We couldn’t find that/ })).toBeVisible();

  const gone = await page.request.get(`/api/awards/${awardId}/export/json`);
  expect(gone.status()).toBe(404);
  expect(await gone.text()).not.toContain(sampleTitle);
});
