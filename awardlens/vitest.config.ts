import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Several source modules import `server-only`, whose real entrypoint throws
 * outside a React Server Component graph. Under test we alias it to an empty
 * module so those modules can be imported and their pure logic exercised
 * directly. Nothing else about module resolution is changed — `@/` still comes
 * from tsconfig via vite-tsconfig-paths.
 */
const serverOnlyStub = fileURLToPath(
  new URL("./tests/unit/_stubs/server-only.ts", import.meta.url),
);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: [{ find: /^server-only$/, replacement: serverOnlyStub }],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    /**
     * Test files run one at a time.
     *
     * The integration suites share process-wide state — the file-backed store's
     * data directory, and, when DATABASE_URL is set, a single Postgres database
     * that each suite truncates in `beforeEach`. Run in parallel they wipe each
     * other mid-test, which shows up as a scatter of unrelated failures rather
     * than anything that points at the cause.
     *
     * The whole suite runs in a couple of seconds, so serialising costs nothing
     * worth having.
     */
    fileParallelism: false,
  },
});
