import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { analysePastedAward, signIn, uniqueEmail } from "./helpers";

/**
 * Tenant isolation — the test this product cannot afford to fail.
 *
 * A grant agreement carries budget detail, staff names and information about
 * the people an organisation serves. Every authenticated route resolves through
 * `requireSession()` and then scopes its query by organisation id; this spec
 * attacks that boundary directly with a real award id belonging to somebody
 * else, and checks both halves of the guarantee: a genuine 404 status, and — the
 * half that actually protects a tenant — no trace of the award in the bytes that
 * come back.
 */

const CANARY = `CANARY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const AWARD_NAME = `Riverbend confidential award ${CANARY}`;

/** A short synthetic agreement whose requirements are unmistakably A's. */
const AWARD_TEXT = `${AWARD_NAME.toUpperCase()}

Grant Number: ${CANARY}
Grantee: Blackthorn Neighbourhood Alliance, Inc.
Grant Amount: Forty-Two Thousand Dollars ($42,000.00)
Grant Period: March 1, 2026 through February 28, 2027

ARTICLE I. REPORTING

1.1 The Grantee shall submit an annual narrative report to the Foundation no later than
April 30, 2027, quoting internal reference ${CANARY} on the cover page.

1.2 The Grantee shall submit an annual financial report together with the narrative report
required by Section 1.1.

ARTICLE II. USE OF FUNDS

2.1 The Grantee shall not regrant or subgrant any portion of the grant funds to another
organisation without the prior written approval of the Foundation.

2.2 The Grantee shall retain all records relating to the receipt and expenditure of the grant
funds for a period of not less than four (4) years.

ARTICLE III. ACKNOWLEDGMENT

3.1 The Grantee shall acknowledge the Foundation in its annual report and on its website.
`;

test.describe.configure({ mode: "serial" });

let ownerContext: BrowserContext;
let ownerPage: Page;
let intruderContext: BrowserContext;
let intruderPage: Page;

let awardId: string;
let obligationTitles: string[] = [];

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  const contextOptions = {
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
  };

  // Two genuinely separate browsers: separate cookie jars, separate sessions.
  ownerContext = await browser.newContext(contextOptions);
  ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, uniqueEmail("isolation-owner"));
  awardId = await analysePastedAward(ownerPage, { name: AWARD_NAME, text: AWARD_TEXT });

  const owned = JSON.parse(
    await (await ownerPage.request.get(`/api/awards/${awardId}/export/json`)).text(),
  );
  obligationTitles = owned.obligations.map((item: { title: string }) => item.title);

  expect(owned.award.name).toBe(AWARD_NAME);
  expect(obligationTitles.length, "the planted award produced no obligations").toBeGreaterThan(0);

  intruderContext = await browser.newContext(contextOptions);
  intruderPage = await intruderContext.newPage();
  await signIn(intruderPage, uniqueEmail("isolation-intruder"));
});

test.afterAll(async () => {
  await ownerContext?.close();
  await intruderContext?.close();
});

/** Fails if any trace of A's award appears in a response B received. */
function expectNoLeak(body: string, where: string): void {
  expect(body, `${where} leaked the award name`).not.toContain(AWARD_NAME);
  expect(body, `${where} leaked the canary reference`).not.toContain(CANARY);
  expect(body, `${where} leaked the grantee name`).not.toContain("Blackthorn Neighbourhood");

  for (const title of obligationTitles) {
    expect(body, `${where} leaked the obligation "${title}"`).not.toContain(title);
  }
}

test("the owner can see their own award", async () => {
  // The control. Without this, every assertion below could pass trivially.
  await ownerPage.goto(`/app/awards/${awardId}`);
  await expect(ownerPage.getByRole("heading", { name: AWARD_NAME, level: 1 })).toBeVisible();
  await expect(ownerPage.getByText(new RegExp(CANARY)).first()).toBeVisible();
});

test("another organisation cannot open the award workspace", async () => {
  const response = await intruderPage.goto(`/app/awards/${awardId}`);

  expect(response?.status(), "an award belonging to someone else was served").toBe(404);
  await expect(
    intruderPage.getByRole("heading", { name: /We couldn’t find that/ }),
  ).toBeVisible();

  expectNoLeak(await intruderPage.content(), "the award workspace");
});

test("another organisation cannot open the review queue", async () => {
  const response = await intruderPage.goto(`/app/awards/${awardId}/review`);

  expect(response?.status()).toBe(404);
  await expect(intruderPage.getByRole("heading", { name: /We couldn’t find that/ })).toBeVisible();
  await expect(
    intruderPage.getByRole("heading", { name: "Review what this award requires" }),
  ).toHaveCount(0);
  await expect(intruderPage.getByRole("list", { name: "Obligations awaiting review" })).toHaveCount(
    0,
  );

  expectNoLeak(await intruderPage.content(), "the review queue");
});

test("another organisation cannot open the obligation register", async () => {
  const response = await intruderPage.goto(`/app/awards/${awardId}/obligations`);

  expect(response?.status()).toBe(404);
  await expect(intruderPage.getByRole("heading", { name: /We couldn’t find that/ })).toBeVisible();
  await expect(intruderPage.getByRole("article")).toHaveCount(0);
  await expect(intruderPage.getByRole("table")).toHaveCount(0);

  expectNoLeak(await intruderPage.content(), "the obligation register");
});

test("the other authenticated views of the award are closed too", async () => {
  // Ask and the printable operating plan read the same workspace.
  for (const suffix of ["/ask", "/plan"]) {
    const response = await intruderPage.goto(`/app/awards/${awardId}${suffix}`);
    expect(response?.status(), `${suffix} was served to another organisation`).toBe(404);
    await expect(
      intruderPage.getByRole("heading", { name: /We couldn’t find that/ }),
    ).toBeVisible();
    expectNoLeak(await intruderPage.content(), suffix);
  }
});

test("the export API refuses another organisation in every format", async () => {
  for (const format of ["json", "csv", "ics"]) {
    const response = await intruderPage.request.get(
      `/api/awards/${awardId}/export/${format}`,
    );

    expect(
      response.status(),
      `the ${format} export was served to another organisation`,
    ).toBe(404);

    const body = await response.text();
    expectNoLeak(body, `the ${format} export`);
    expect(body).not.toContain("formatVersion");
    expect(body).not.toContain("BEGIN:VCALENDAR");
  }
});

test("a signed-out request to the export API returns no data", async ({ request }) => {
  // A bare request with no cookie jar at all.
  for (const format of ["json", "csv", "ics"]) {
    const response = await request.get(`/api/awards/${awardId}/export/${format}`);

    expect(response.status(), `the ${format} export was served without a session`).toBe(404);
    expectNoLeak(await response.text(), `the anonymous ${format} export`);
  }
});

test("the intruder's own dashboard is unaffected and still empty", async () => {
  await intruderPage.goto("/app");

  await expect(intruderPage.getByRole("heading", { level: 1 })).toContainText("Welcome to");
  expectNoLeak(await intruderPage.content(), "the intruder's dashboard");

  // And the owner's award is still intact after all of that.
  await ownerPage.goto(`/app/awards/${awardId}`);
  await expect(ownerPage.getByRole("heading", { name: AWARD_NAME, level: 1 })).toBeVisible();
});
