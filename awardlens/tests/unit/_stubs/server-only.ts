/**
 * Test stub for the `server-only` marker package.
 *
 * The real package throws when imported outside a React Server Component
 * graph, which would make every server module unimportable under Vitest.
 * Aliased in via `resolve.alias` in vitest.config.ts.
 */
export {};
