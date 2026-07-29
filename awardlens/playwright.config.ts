import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Three decisions here are load-bearing and deliberate:
 *
 *  1. The suite runs against `next dev`, not `next start`. Sign-in is a
 *     six-digit code that `src/app/actions/auth.ts` only returns to the browser
 *     when `NODE_ENV !== "production"`. In a production build with no Resend
 *     key there is no way for a test — or a person — to sign in at all, so a
 *     production build cannot exercise a single authenticated screen.
 *
 *  2. The file-backed store (`src/lib/db/local.ts`) is shared mutable state, so
 *     the suite is serial (`fullyParallel: false`, one worker). It is pointed at
 *     a fresh temp directory per run so a run never reads or writes a
 *     developer's own data, and every run starts from an empty database.
 *
 *  3. Extraction runs in deterministic fixture mode with no model configured, so
 *     the pipeline is offline, fast and produces identical output every run.
 */

const DATA_DIR =
  process.env.AWARDLENS_E2E_DATA_DIR ??
  path.join(os.tmpdir(), `awardlens-e2e-${Date.now()}-${process.pid}`);

const BASE_URL = "http://localhost:3000";

/**
 * Some environments provide a Chromium build whose revision differs from the one
 * this Playwright version would download, and where downloading is not an
 * option. Point at that binary when it is present; otherwise say nothing and let
 * Playwright resolve its own browser exactly as it normally would.
 */
function resolveChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit) return explicit;

  const preinstalled = path.join(
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers",
    "chromium",
  );
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const chromiumExecutable = resolveChromium();

/** Empty unless a specific binary has to be named — never a channel override. */
const browserBinary = chromiumExecutable
  ? { launchOptions: { executablePath: chromiumExecutable } }
  : {};

export default defineConfig({
  testDir: "./tests/e2e",

  // The JSON store is shared state: two workers would interleave writes to the
  // same file and the "did my change persist?" assertions would be meaningless.
  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  // Dev-mode route compilation is lazy: the first visit to a route can take
  // several seconds before the page is even served.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },

  projects: [
    {
      name: "chromium",
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...browserBinary,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // A real small-phone viewport, not a UA string: the responsive specs care
      // about layout and the drawer breakpoint, both of which are width-driven.
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...browserBinary,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Cold start compiles the app and next/font fetches Google Fonts over the
    // network; both are slow the first time and neither is worth flaking over.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      AWARDLENS_DATA_DIR: DATA_DIR,
      AUTH_SECRET: "awardlens-e2e-auth-secret-do-not-use-in-production",
      USE_DETERMINISTIC_AI_FIXTURES: "true",
      DEVELOPMENT_BILLING_MODE: "true",
      NEXT_PUBLIC_APP_URL: BASE_URL,

      // Playwright merges this over `process.env`, so anything a developer
      // happens to have exported would otherwise be inherited by the server the
      // suite drives. These two are blanked deliberately rather than left to
      // chance: `DATABASE_URL` would point the store at a real Postgres and the
      // suite would create and delete awards in it, and `RESEND_API_KEY` would
      // post real email for every generated @example.org address. Empty fails
      // the `min(1)` in `src/lib/env`, so both fall back to the safe default.
      DATABASE_URL: "",
      RESEND_API_KEY: "",
    },
  },
});
