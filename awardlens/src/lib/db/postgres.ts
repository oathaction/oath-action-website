import "server-only";

/**
 * The Postgres adapter.
 *
 * Composed from the modules under `./pg/`, each of which owns one slice of the
 * store. Together they present exactly the surface of `./local.ts` — that file
 * is the reference implementation and the contract, and
 * `tests/integration/postgres-adapter.test.ts` types itself against it so the
 * claim is checked at compile time rather than asserted in a comment.
 *
 * Authorisation note: this adapter connects as the service role, which bypasses
 * row-level security. Tenant isolation here is the `organization_id` predicate
 * in every query, exactly as in the local store. RLS remains the backstop for
 * anything reaching the database as an authenticated user.
 */

export * from "./pg/identity";
export * from "./pg/awards";
export * from "./pg/obligations";
export * from "./pg/ops";
