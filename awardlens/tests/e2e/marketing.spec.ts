import { expect, test } from "@playwright/test";

/**
 * The public pages.
 *
 * Two things are being protected here. First, that the marketing site actually
 * works: one heading, real navigation, and a demo that shows the product's real
 * output rather than a picture of it. Second, that it does not overclaim — a
 * tool that reads grant agreements must never imply it certifies compliance.
 */

/**
 * Claims AwardLens must not make. Note what is *not* here: the bare strings
 * "SOC 2" and "HIPAA". The home page carries an explicit, honest disclaimer —
 * "AwardLens holds no SOC 2, ISO, HIPAA or FedRAMP certification" — and banning
 * the substring would forbid the page from telling the truth. What matters is
 * the assertion of a certification or a guarantee, so that is what is banned.
 */
const FORBIDDEN_CLAIMS = [
  /guarantees?\s+compliance/i,
  /guaranteed\s+compliance/i,
  /ensures?\s+compliance/i,
  /compliance\s+guaranteed/i,
  /SOC\s*2\s*(type\s*(i|ii|1|2)\s*)?(certified|compliant|compliance|attested)/i,
  /(certified|compliant)\s+(to\s+)?SOC\s*2/i,
  /HIPAA[- ](certified|compliant|compliance)/i,
  /(certified|compliant)\s+(to\s+|with\s+)?HIPAA/i,
  /fully\s+compliant/i,
  /100%\s+(accurate|compliant)/i,
];

async function expectNoComplianceClaims(text: string, where: string): Promise<void> {
  for (const pattern of FORBIDDEN_CLAIMS) {
    expect(text, `${where} makes a compliance claim matching ${pattern}`).not.toMatch(pattern);
  }
}

test.describe("marketing site", () => {
  test("the home page renders the hero with a single top-level heading", async ({ page }) => {
    await page.goto("/");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("Every grant comes with promises");

    // The hero's two calls to action are the whole funnel.
    await expect(page.getByRole("link", { name: "Analyse an award" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View a sample" }).first()).toBeVisible();

    await expect(page).toHaveTitle(/AwardLens/);
  });

  test("the header navigates to pricing and the hero navigates to the sample", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Pricing" })
      .click();
    await page.waitForURL(/\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Priced for the size");

    await page.getByRole("link", { name: "AwardLens — home" }).click();
    await page.waitForURL(/localhost:3000\/$/);

    await page.getByRole("link", { name: "View a sample" }).first().click();
    await page.waitForURL(/\/demo$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("What AwardLens produces");
  });

  test("the demo shows real obligations, each with a visible source citation", async ({
    page,
  }) => {
    await page.goto("/demo");

    const register = page.getByRole("region", { name: "The obligation register" });
    const cards = register.getByRole("article");

    // The sample document genuinely produces a double-figure register; if the
    // pipeline silently stopped extracting, this is where it shows.
    const cardCount = await cards.count();
    expect(cardCount, "the worked sample should show a substantial register").toBeGreaterThanOrEqual(
      6,
    );

    // Every single card must carry its provenance, and it must be readable —
    // this is the product's central claim, made on a public page.
    for (let index = 0; index < cardCount; index += 1) {
      const card = cards.nth(index);
      const heading = await card.getByRole("heading").first().innerText();

      await expect(
        card.getByText(/^Source: /),
        `demo obligation "${heading}" has no source locator`,
      ).toBeVisible();

      const quote = card.locator("blockquote");
      await expect(quote, `demo obligation "${heading}" has no quoted passage`).toBeVisible();
      const quoted = (await quote.innerText()).replace(/[“”"…]/g, "").trim();
      expect(
        quoted.length,
        `demo obligation "${heading}" quotes an empty passage`,
      ).toBeGreaterThan(20);
    }

    // Nothing in the sample is pre-confirmed, and the page says so.
    await expect(cards.getByText("Needs review").first()).toBeVisible();
    await expect(
      page.getByText("AwardLens never marks its own output as confirmed"),
    ).toBeVisible();
  });

  test("the pricing page lists every plan with its award allowance", async ({ page }) => {
    await page.goto("/pricing");

    for (const plan of ["Free", "Single Award Pack", "Small Organisation", "Team"]) {
      await expect(
        page.getByRole("heading", { name: plan, exact: true }).first(),
        `the ${plan} plan is missing from the pricing page`,
      ).toBeVisible();
    }

    await expect(page.getByText("One award analysis").first()).toBeVisible();
    await expect(page.getByText("Up to 12 awards").first()).toBeVisible();
  });

  test("no public page claims certification or guarantees compliance", async ({ page }) => {
    for (const route of ["/", "/pricing", "/demo"]) {
      await page.goto(route);
      const text = await page.locator("body").innerText();
      await expectNoComplianceClaims(text, route);
    }
  });

  test("the home page states plainly what AwardLens does not claim", async ({ page }) => {
    await page.goto("/");

    // The counterpart to the test above: the absence of overclaiming is only
    // meaningful if the page is also explicit about its limits.
    await expect(page.getByRole("heading", { name: "What we do not claim" })).toBeVisible();
    await expect(
      page.getByText(/holds no SOC 2, ISO, HIPAA or FedRAMP certification/),
    ).toBeVisible();
    await expect(
      page.getByText(/It is not legal, financial or compliance advice/),
    ).toBeVisible();
  });
});
