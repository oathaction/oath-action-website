import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { analyseSample, signIn, uniqueEmail } from "./helpers";

/**
 * Accessibility.
 *
 * The people who have to read a grant agreement are not a self-selecting group,
 * and the review screen is dense: badges, live regions, a document panel and a
 * keyboard-driven queue. Automated checks cannot prove a screen is usable, but
 * they can prove it is not, so every violation here is treated as a defect
 * rather than a warning.
 *
 * Nothing is excluded. If a rule fires inside a third-party primitive it is
 * reported as a failure and named, rather than quietly filtered out — a
 * suppressed violation is a violation a user still meets.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface ViolationSummary {
  id: string;
  impact: string;
  help: string;
  nodes: { target: string; why: string }[];
}

/**
 * Scans the current page and fails with a report a human can act on: which
 * rule, how bad, and the exact element.
 */
async function expectNoViolations(page: Page, label: string, testInfo: TestInfo): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const violations: ViolationSummary[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(" "),
      // The measured reason — contrast ratios, missing attributes — so a report
      // says what is wrong, not merely that something is.
      why: (node.failureSummary ?? "").replace(/\s*\n\s*/g, " ").trim(),
    })),
  }));

  // Recorded on every run, pass or fail, so the report is evidence rather than
  // an absence of noise.
  await testInfo.attach(`axe-${label.replace(/[^\w-]+/g, "-")}`, {
    body: JSON.stringify(
      {
        page: label,
        url: page.url(),
        tags: WCAG_TAGS,
        passes: results.passes.length,
        incomplete: results.incomplete.map((item) => item.id),
        violations,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  console.log(
    `[axe] ${label}: ${violations.length} violations, ${results.passes.length} checks passed`,
  );

  // Soft: one bad page must not stop the scan, or the run reports the first
  // defect and hides every page after it. The test still fails at the end.
  expect.soft(
    violations,
    `${label} has WCAG violations:\n${violations
      .map(
        (v) =>
          `  · [${v.impact}] ${v.id} — ${v.help}\n${v.nodes
            .map((node) => `      ${node.target}\n        ${node.why}`)
            .join("\n")}`,
      )
      .join("\n")}`,
  ).toEqual([]);
}

/**
 * Every region that actually overflows must be scrollable without a mouse.
 *
 * A scroll container reaches the keyboard one of two ways: it is focusable
 * itself, or it contains something focusable to tab into. A container with
 * neither is content a keyboard-only user simply cannot read past the fold —
 * WCAG 2.1.1 — and on this product the worst offender would be the panel that
 * shows the passage an obligation was drawn from.
 */
async function expectScrollableRegionsAreKeyboardAccessible(
  page: Page,
  label: string,
): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    return [...document.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const overflowY = getComputedStyle(element).overflowY;
        if (overflowY !== "auto" && overflowY !== "scroll") return false;
        if (element.scrollHeight <= element.clientHeight + 1) return false;
        if (element.tabIndex >= 0) return false;
        return element.querySelectorAll(focusableSelector).length === 0;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className?.toString().slice(0, 80) ?? "",
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
  });

  expect.soft(
    unreachable,
    `${label} has scrollable regions a keyboard user cannot scroll:\n${unreachable
      .map(
        (region) =>
          `      <${region.tag} class="${region.className}"> ` +
          `${region.scrollHeight}px of content in a ${region.clientHeight}px window`,
      )
      .join("\n")}`,
  ).toEqual([]);
}

/* ------------------------------------------------------------- public pages -- */

test.describe("public pages meet WCAG 2.1 AA", () => {
  for (const [label, route] of [
    ["home", "/"],
    ["pricing", "/pricing"],
    ["demo", "/demo"],
    ["sign-in", "/auth/sign-in"],
  ] as const) {
    test(`${label} (${route})`, async ({ page }, testInfo) => {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page, label, testInfo);
    });
  }

  test("the sign-in page is accessible once a code has been requested", async ({
    page,
  }, testInfo) => {
    // The second step of the form is a different screen and is where the
    // development alert and the one-time-code field live.
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.77.88.99" });
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email address").fill(uniqueEmail("a11y-signin"));
    await page.getByRole("button", { name: /email me a code/i }).click();
    await expect(page.getByLabel("Six-digit code")).toBeVisible();

    await expectNoViolations(page, "sign-in code step", testInfo);
  });
});

/* ------------------------------------------------- authenticated pages -- */

test.describe("authenticated pages meet WCAG 2.1 AA", () => {
  test.describe.configure({ mode: "serial" });

  let awardId: string;

  test("dashboard, upload, award, review, register and settings", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);

    await signIn(page, uniqueEmail("a11y-owner"));

    // Empty dashboard first: a different screen from the populated one.
    await expectNoViolations(page, "dashboard (empty)", testInfo);

    await page.goto("/app/awards/new");
    await expect(page.getByRole("heading", { name: "Analyse an award", level: 1 })).toBeVisible();
    await expectNoViolations(page, "new award", testInfo);

    awardId = await analyseSample(page);

    // Scanned after a real navigation rather than straight off the post-ingest
    // client-side redirect: during a soft transition Next has not yet applied the
    // route's metadata, so `document-title` fires on the transition rather than
    // on the page. The delivered page is what a user reads and what axe should
    // judge.
    await page.goto(`/app/awards/${awardId}/review`);
    await expect(
      page.getByRole("heading", { name: "Review what this award requires", level: 1 }),
    ).toBeVisible();
    await expectNoViolations(page, "review", testInfo);
    await expectScrollableRegionsAreKeyboardAccessible(page, "review");

    await page.goto(`/app/awards/${awardId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoViolations(page, "award workspace", testInfo);

    await page.goto(`/app/awards/${awardId}/obligations`);
    await expect(page.getByRole("heading", { name: "Obligation register", level: 1 })).toBeVisible();
    await expectNoViolations(page, "obligation register (cards)", testInfo);

    // The table view is a genuinely different tree, with sortable headers.
    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expectNoViolations(page, "obligation register (table)", testInfo);

    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoViolations(page, "dashboard (populated)", testInfo);

    await page.goto("/app/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expectNoViolations(page, "settings", testInfo);
  });

  test("the obligation editor dialog is accessible while open", async ({ page }, testInfo) => {
    test.setTimeout(300_000);

    // Dialogs are where focus management and labelling usually break, and axe
    // only sees the tree — it cannot tell you that focus escaped, so the
    // behaviour is checked separately below.
    await signIn(page, uniqueEmail("a11y-dialog"));
    const id = await analyseSample(page);

    await page.goto(`/app/awards/${id}/review`);
    const rail = page
      .getByRole("list", { name: "Obligations awaiting review" })
      .getByRole("article")
      .first();
    const obligationTitle = (await rail.getByRole("heading").first().innerText()).trim();
    await rail.getByRole("button", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit this requirement" })).toBeVisible();
    await expectNoViolations(page, "obligation editor dialog", testInfo);

    // Opening moves focus into the dialog rather than leaving it behind on the
    // page underneath, where a keyboard user would have no idea what happened.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const open = document.querySelector('[role="dialog"]');
          return Boolean(open && document.activeElement && open.contains(document.activeElement));
        }),
      )
      .toBe(true);

    // Focus is trapped: tabbing repeatedly never lands outside the dialog.
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press("Tab");
      const escaped = await page.evaluate(() => {
        const open = document.querySelector('[role="dialog"]');
        const active = document.activeElement;
        if (!open || !active || active === document.body) return null;
        return open.contains(active) ? null : (active.textContent ?? active.tagName).slice(0, 60);
      });
      expect(escaped, `focus escaped the editor dialog onto "${escaped}"`).toBeNull();
    }

    // Escape closes it and hands focus back to where the user was — the row in
    // the review queue they opened the editor from — rather than dropping it on
    // <body>, which would put them at the top of the document.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const queue = page.getByRole("list", { name: "Obligations awaiting review" });
    await expect(
      queue.locator(":focus"),
      "focus did not return to the review queue after the editor closed",
    ).toHaveCount(1);

    const restored = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return null;
      return active.getAttribute("aria-label") ?? active.textContent?.trim().slice(0, 80) ?? "";
    });
    expect(restored, "focus fell to <body> when the editor closed").not.toBeNull();
    expect(
      restored,
      "focus returned somewhere unrelated to the item that was being edited",
    ).toContain(obligationTitle);

    /* --------------------------------------------------- add obligation -- */
    await page.goto(`/app/awards/${id}/obligations`);
    const addTrigger = page.getByRole("button", { name: "Add an obligation" });
    await addTrigger.click();

    const addDialog = page.getByRole("dialog");
    await expect(addDialog.getByRole("heading", { name: "Add an obligation" })).toBeVisible();
    await expectNoViolations(page, "add obligation dialog", testInfo);

    // The dialog explains how a hand-entered item will be recorded; that
    // explanation is part of the dialog's description, not decoration.
    await expect(addDialog.getByText(/stored as .*confirmed/)).toBeVisible();
    await expect(addDialog.getByText(/with no source citation/)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(addDialog).toBeHidden();
    await expect(addTrigger).toBeFocused();
  });
});

/* ----------------------------------------------------------- keyboard use -- */

test.describe("keyboard operability", () => {
  test("the skip link is the first stop and it works", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toHaveText("Skip to content");
    await expect(
      focused,
      "the skip link must become visible when focused, not stay screen-reader only",
    ).toBeInViewport();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);

    // It has to land somewhere real: the main landmark, containing the heading.
    const main = page.locator("#main");
    await expect(main).toHaveCount(1);
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("every action on the review screen is reachable and shows focus", async ({ page }) => {
    test.setTimeout(300_000);

    await signIn(page, uniqueEmail("a11y-keyboard"));
    const awardId = await analyseSample(page);
    await page.goto(`/app/awards/${awardId}/review`);

    const rail = page
      .getByRole("list", { name: "Obligations awaiting review" })
      .getByRole("article")
      .first();
    await expect(rail).toBeVisible();

    const expected = ["Confirm", "Needs clarification", "Not applicable", "Edit", "Delete"];
    const reached: string[] = [];

    // Walk forwards from the top of the document until every action button has
    // been focused, checking the focus indicator at each stop along the way.
    for (let step = 0; step < 120 && reached.length < expected.length; step += 1) {
      await page.keyboard.press("Tab");

      const state = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;

        const style = getComputedStyle(element);
        const width = parseFloat(style.outlineWidth || "0");
        return {
          label: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
          matchesFocusVisible: element.matches(":focus-visible"),
          outlineWidth: width,
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });

      if (!state) continue;

      // Keyboard focus must always be drawn. `:focus-visible` is styled globally
      // with a 2px outline; anything less is an invisible caret position.
      expect(
        state.matchesFocusVisible,
        `keyboard focus on "${state.label.slice(0, 60)}" did not match :focus-visible`,
      ).toBe(true);

      const hasIndicator =
        (state.outlineStyle !== "none" && state.outlineWidth >= 1) ||
        (state.boxShadow !== "none" && state.boxShadow !== "");
      expect(
        hasIndicator,
        `no visible focus indicator on "${state.label.slice(0, 60)}"`,
      ).toBe(true);

      const match = expected.find(
        (name) => !reached.includes(name) && state.label.startsWith(name),
      );
      if (match) reached.push(match);
    }

    expect(
      reached,
      `these review actions could not be reached with the keyboard: ${expected
        .filter((name) => !reached.includes(name))
        .join(", ")}`,
    ).toHaveLength(expected.length);
  });

  test("the review queue can be driven with its documented shortcuts", async ({ page }) => {
    test.setTimeout(300_000);

    await signIn(page, uniqueEmail("a11y-keys"));
    const awardId = await analyseSample(page);
    await page.goto(`/app/awards/${awardId}/review`);

    // The shortcuts are advertised in the UI, so they are part of the contract.
    const shortcutsToggle = page.getByRole("button", { name: "Shortcuts", exact: true });
    await shortcutsToggle.click();
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
    await expect(shortcutsToggle).toHaveAttribute("aria-expanded", "true");
    await shortcutsToggle.click();
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeHidden();

    const queue = page.getByRole("list", { name: "Obligations awaiting review" });
    const firstTitle = await queue.getByRole("article").first().getByRole("heading").innerText();

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("j");

    const afterMove = await queue.getByRole("article").first().getByRole("heading").innerText();
    expect(afterMove, "pressing j did not move to the next item").not.toBe(firstTitle);

    await page.keyboard.press("k");
    await expect(queue.getByRole("article").first().getByRole("heading")).toHaveText(firstTitle);
  });
});
