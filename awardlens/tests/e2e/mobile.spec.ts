import { expect, test } from "@playwright/test";

import { analyseSample, expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

/**
 * The product at 390 × 844 — a small phone held in one hand.
 *
 * Nonprofit finance staff read award documents on the train and on site, so
 * "works on mobile" cannot mean "renders without crashing". The three things
 * tested here are the ones that make it usable: the marketing nav can be opened
 * and closed, the source document is still reachable beside an obligation, and
 * nothing anywhere forces the page sideways.
 */

test.describe("marketing at a phone width", () => {
  test("the navigation toggle opens and closes", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Menu" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // The desktop nav is out of the way at this width.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const mobileNav = page.getByRole("navigation", { name: "Primary, mobile" });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole("link", { name: "Pricing" })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(mobileNav).toBeHidden();

    // Escape closes it too, which is what a keyboard user will reach for.
    await toggle.click();
    await expect(mobileNav).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(mobileNav).toBeHidden();
  });

  test("following a link from the menu closes it", async ({ page }) => {
    // A menu that stays open over the section you just asked to see is worse
    // than no menu; this is the reason the header is a client component at all.
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();

    const mobileNav = page.getByRole("navigation", { name: "Primary, mobile" });
    await mobileNav.getByRole("link", { name: "Pricing" }).click();

    await page.waitForURL(/\/pricing$/);
    await expect(mobileNav).toBeHidden();
  });

  test("no public page scrolls sideways", async ({ page }) => {
    for (const route of ["/", "/pricing", "/demo"]) {
      await page.goto(route);
      await expectNoHorizontalScroll(page, route);
    }
  });
});

test.describe("the application at a phone width", () => {
  test("the dashboard, review screen and register are usable", async ({ page }) => {
    test.setTimeout(240_000);

    await signIn(page, uniqueEmail("mobile-owner"));

    /* --------------------------------------------------------- dashboard -- */
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Analyse your first award/ })).toBeVisible();
    await expectNoHorizontalScroll(page, "the empty dashboard");

    const awardId = await analyseSample(page);

    /* ------------------------------------------------------------ review -- */
    await expect(
      page.getByRole("heading", { name: "Review what this award requires", level: 1 }),
    ).toBeVisible();

    const queue = page.getByRole("list", { name: "Obligations awaiting review" });
    await expect(queue).toBeVisible();
    expect(await queue.locator("> li").count()).toBeGreaterThan(0);

    // The desktop layout puts the document beside the queue; at this width the
    // column is gone and the drawer is the only way to reach the source.
    const openSource = page.getByRole("button", { name: "Open the source document" });
    await expect(
      openSource,
      "there is no way to reach the source document on a phone",
    ).toBeVisible();

    await openSource.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/This is the stored text AwardLens actually analysed/)).toBeVisible();
    await expect(drawer.getByText("WHITFIELD FAMILY FOUNDATION").first()).toBeVisible();

    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();

    // The review actions are reachable, not clipped off the side of the screen.
    const firstRail = queue.getByRole("article").first();
    await expect(firstRail.getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page, "the review screen");

    /* ---------------------------------------------------------- register -- */
    await page.goto(`/app/awards/${awardId}/obligations`);
    await expect(page.getByRole("heading", { name: "Obligation register", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Search")).toBeVisible();
    await expectNoHorizontalScroll(page, "the obligation register");

    /* --------------------------------------------------- populated views -- */
    await page.goto(`/app/awards/${awardId}`);
    await expectNoHorizontalScroll(page, "the award workspace");

    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page, "the populated dashboard");
  });
});
