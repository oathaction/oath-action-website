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
  },
});
