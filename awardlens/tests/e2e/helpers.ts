import { expect, type Page } from "@playwright/test";

/**
 * Shared end-to-end helpers.
 *
 * These are deliberately thin: they drive the product the way a person does
 * (visible labels, real forms, real redirects) so that when a helper breaks, it
 * is because the user-facing flow broke.
 */

/* ------------------------------------------------------------- identity -- */

let sequence = 0;

/**
 * A fresh address per call.
 *
 * Two reasons this matters. Signing in with an unseen address creates a new
 * profile and a new organisation, which is what gives each test its own data
 * island. And the free plan allows exactly one award per organisation
 * (`src/lib/billing/plans.ts`), so a test that analyses an award needs an
 * organisation nobody has spent that allowance on.
 */
export function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}@example.org`;
}

/**
 * A distinct client IP per sign-in.
 *
 * Sign-in is rate limited to 8 attempts per 15 minutes per client
 * (`RATE_LIMITS.signIn`), keyed on the first `x-forwarded-for` hop and falling
 * back to the literal string "unknown" when the header is absent. Every test in
 * the suite would otherwise share that one bucket and the ninth sign-in of the
 * run would fail for reasons that have nothing to do with the behaviour under
 * test. Presenting a different forwarded address per sign-in models what it
 * really is — a different person on a different network — and leaves the limit
 * itself intact and exercised.
 */
function uniqueClientAddress(): string {
  // Drawn at random from a 24-bit space rather than counted, because the
  // server's rate-limit buckets outlive a single `playwright test` invocation:
  // a counter restarting at zero would re-use addresses whose 15-minute window
  // is still open, and the ninth sign-in of the afternoon would fail.
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

/* ------------------------------------------------------------------ auth -- */

/** Reads the six-digit code out of the development alert on the sign-in page. */
async function readDevelopmentCode(page: Page): Promise<string> {
  const developmentAlert = page
    .getByRole("alert")
    .filter({ hasText: "Development mode" });

  await expect(
    developmentAlert,
    "the sign-in page should surface the login code when no email provider is configured",
  ).toBeVisible();

  const text = await developmentAlert.innerText();
  const match = text.match(/\b(\d{6})\b/);
  expect(match, `no six-digit code found in the development alert: ${text}`).not.toBeNull();
  return match![1];
}

/**
 * Signs in end to end: request a code, read it off the page, verify it, and land
 * on the dashboard. Asserts at each step, so a caller that returns has genuinely
 * authenticated rather than merely navigated.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": uniqueClientAddress() });

  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: /email me a code/i }).click();

  const code = await readDevelopmentCode(page);

  await page.getByLabel("Six-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.waitForURL(/\/app(\?.*)?$/, { timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

/** Signs out through the account menu in the application header. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/localhost:3000\/$/, { timeout: 60_000 });
}

/* -------------------------------------------------------------- ingestion -- */

export interface AnalyseSampleOptions {
  /**
   * Assert the processing checklist appears while the document is being
   * analysed. Off by default so callers that only need an award do not race the
   * redirect.
   */
  observeProcessing?: boolean;
}

/**
 * Analyses the built-in sample award and returns the new award's id.
 *
 * The sample tab is the most reliable ingestion path: no file system, no
 * multipart body from the test, and the same server-side pipeline as a real
 * upload.
 */
export async function analyseSample(
  page: Page,
  options: AnalyseSampleOptions = {},
): Promise<string> {
  await page.goto("/app/awards/new");
  await expect(page.getByRole("heading", { name: "Analyse an award", level: 1 })).toBeVisible();

  await page.getByRole("tab", { name: "Use a sample" }).click();

  const analyse = page.getByRole("button", { name: "Analyse the sample" });
  await expect(analyse).toBeVisible();

  if (options.observeProcessing) {
    // Deterministic extraction is offline and fast enough that the checklist can
    // come and go inside a single assertion. Holding the ingest request open
    // makes the progress UI observable without changing what it does — the
    // panel is rendered by the client the moment the form is submitted.
    await page.route("**/api/awards/ingest", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      // The page navigates away as soon as analysis finishes, which can retire
      // the route from under us; that is not a failure of anything.
      await route.continue().catch(() => {});
    });

    const checklist = page.getByRole("list").filter({ hasText: "Securing document" });

    await Promise.all([
      expect(
        page.getByRole("heading", { name: "Analysing your award" }),
        "the stage checklist should be shown while the document is analysed",
      ).toBeVisible({ timeout: 30_000 }),
      analyse.click(),
    ]);

    // Read the checklist once: it is a live region that disappears on redirect,
    // so six separate round trips would be racing the thing under test.
    await expect(checklist.getByRole("listitem")).toHaveCount(6);
    const stages = await checklist.innerText();

    for (const stage of [
      "Securing document",
      "Reading document",
      "Identifying award details",
      "Finding obligations",
      "Checking source references",
      "Preparing review",
    ]) {
      expect(stages, `the processing checklist never mentions "${stage}"`).toContain(stage);
    }
  } else {
    await analyse.click();
  }

  await page.waitForURL(/\/app\/awards\/[^/]+\/review/, { timeout: 120_000 });
  await page.unroute("**/api/awards/ingest").catch(() => {});
  return awardIdFromUrl(page.url());
}

/**
 * Analyses pasted award text under a caller-chosen name.
 *
 * The sample tab always produces an award called "Sample foundation grant", so
 * a test that needs to prove one organisation's data never reaches another has
 * to be able to plant a name and a phrase that could only have come from here.
 */
export async function analysePastedAward(
  page: Page,
  award: { name: string; text: string },
): Promise<string> {
  await page.goto("/app/awards/new");
  await page.getByRole("tab", { name: "Paste text" }).click();

  await page.getByLabel("Award document text").fill(award.text);
  await page.getByLabel("Award name (optional)").fill(award.name);
  await page.getByRole("button", { name: "Analyse this award" }).click();

  await page.waitForURL(/\/app\/awards\/[^/]+\/(review|$)/, { timeout: 120_000 });
  return awardIdFromUrl(page.url());
}

/** Pulls the award id out of any `/app/awards/{id}/...` URL. */
export function awardIdFromUrl(url: string): string {
  const match = new URL(url).pathname.match(/^\/app\/awards\/([^/]+)/);
  expect(match, `expected an award URL, got ${url}`).not.toBeNull();
  return match![1];
}

/* -------------------------------------------------------------- assertions -- */

/**
 * Nothing on the page may push the document wider than the viewport. One pixel
 * of slack absorbs sub-pixel rounding in the layout engine; anything more is a
 * real horizontal scrollbar.
 */
export async function expectNoHorizontalScroll(page: Page, what: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    overflow.scrollWidth,
    `${what} scrolls horizontally: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
