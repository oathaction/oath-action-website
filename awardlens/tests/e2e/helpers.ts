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
  sequence += 1;
  const octet3 = Math.floor(sequence / 250) % 250;
  const octet4 = (sequence % 250) + 1;
  return `198.51.${100 + octet3}.${octet4}`;
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
    const processingHeading = page.getByRole("heading", { name: "Analysing your award" });
    await Promise.all([
      expect(
        processingHeading,
        "the stage checklist should be shown while the document is analysed",
      ).toBeVisible({ timeout: 30_000 }),
      analyse.click(),
    ]);

    // The checklist names every stage the server streams, so the user can see
    // what is happening rather than watching an invented progress bar.
    for (const stage of [
      "Securing document",
      "Reading document",
      "Identifying award details",
      "Finding obligations",
      "Checking source references",
      "Preparing review",
    ]) {
      await expect(page.getByText(stage, { exact: true })).toBeVisible();
    }
  } else {
    await analyse.click();
  }

  await page.waitForURL(/\/app\/awards\/[^/]+\/review/, { timeout: 120_000 });
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
