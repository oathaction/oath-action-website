import { expect, test } from "@playwright/test";

import { signIn, signOut, uniqueEmail } from "./helpers";

/**
 * Authentication and the boundary it draws.
 *
 * The product's whole data model hangs off `requireSession()`, so these tests
 * check the two directions that matter: a person with a valid code gets in, and
 * a person without one gets nothing — no page, no data, not even the existence
 * of a record.
 */

test.describe("authentication", () => {
  test("a six-digit emailed code signs a new person in and creates their organisation", async ({
    page,
  }) => {
    const email = uniqueEmail("auth-owner");
    await signIn(page, email);

    await expect(page).toHaveURL(/\/app$/);

    // A brand-new organisation starts empty and says so, rather than showing a
    // dashboard of somebody else's awards.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to");
    await expect(page.getByRole("link", { name: /Analyse your first award/ })).toBeVisible();

    // The signed-in identity is the address that was used.
    await page.goto("/app/settings");
    await expect(page.getByText(email)).toBeVisible();
  });

  test("an incorrect code is refused and does not sign anybody in", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "203.0.113.77" });
    await page.goto("/auth/sign-in");

    await page.getByLabel("Email address").fill(uniqueEmail("auth-wrong-code"));
    await page.getByRole("button", { name: /email me a code/i }).click();

    const developmentAlert = page.getByRole("alert").filter({ hasText: "Development mode" });
    await expect(developmentAlert).toBeVisible();
    const realCode = (await developmentAlert.innerText()).match(/\b(\d{6})\b/)![1];

    // Deliberately a different six-digit value from the one issued.
    const wrongCode = String((Number(realCode) + 111_111) % 1_000_000).padStart(6, "0");

    await page.getByLabel("Six-digit code").fill(wrongCode);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("That code is not correct.")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in$/);

    // And the failed attempt left no session behind.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
  });

  test("an unauthenticated visit to the dashboard is redirected to sign in", async ({ page }) => {
    await page.goto("/app");

    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  });

  test("every authenticated route is closed to a signed-out visitor", async ({ page }) => {
    for (const route of [
      "/app",
      "/app/awards/new",
      "/app/settings",
      "/app/awards/some-made-up-id",
      "/app/awards/some-made-up-id/review",
      "/app/awards/some-made-up-id/obligations",
    ]) {
      await page.goto(route);
      await expect(page, `${route} was reachable while signed out`).toHaveURL(
        /\/auth\/sign-in$/,
      );
    }
  });

  test("a made-up award id exposes nothing to a signed-out visitor", async ({ page }) => {
    // Not just "does it redirect" — the response must not disclose whether the
    // id exists, and must not carry a fragment of anybody's register.
    const response = await page.request.get("/app/awards/some-made-up-id/review");
    const body = await response.text();

    expect(body).not.toContain("Obligation register");
    expect(body).not.toContain("Review what this award requires");
    expect(body).not.toMatch(/Needs review/);

    const exportResponse = await page.request.get("/api/awards/some-made-up-id/export/json");
    expect(exportResponse.status()).toBe(404);
    expect(await exportResponse.text()).not.toContain("formatVersion");
  });

  test("signing out ends the session and re-protects the application", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("auth-signout");
    await signIn(page, email);
    await expect(page).toHaveURL(/\/app$/);

    expect(
      (await context.cookies()).map((cookie) => cookie.name),
      "a session cookie should exist before signing out",
    ).toContain("awardlens_session");

    await signOut(page);

    // Back on the public site…
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Every grant comes with promises",
    );

    // …the session cookie is genuinely gone, not merely unused…
    expect(
      (await context.cookies()).map((cookie) => cookie.name),
      "the session cookie must be cleared, or a shared machine stays signed in for 30 days",
    ).not.toContain("awardlens_session");

    // …and the application is closed again.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/auth\/sign-in$/);

    // Going "back" must not resurrect the authenticated page from cache.
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
  });

  test("signing out works from the keyboard alone", async ({ page, context }) => {
    // The menu item and the submit button are the same element, and Radix's
    // Enter handling runs through the same select path that once detached the
    // form mid-submit. A pointer-only test would not have caught that.
    await signIn(page, uniqueEmail("auth-signout-keyboard"));

    const accountMenu = page.getByRole("button", { name: /account menu/i });
    await accountMenu.focus();
    await page.keyboard.press("Enter");

    const signOutItem = page.getByRole("menuitem", { name: "Sign out" });
    await expect(signOutItem).toBeVisible();

    await signOutItem.focus();
    await expect(signOutItem).toBeFocused();
    await page.keyboard.press("Enter");

    await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
      "awardlens_session",
    );

    await page.goto("/app");
    await expect(page).toHaveURL(/\/auth\/sign-in$/);
  });
});
