import "server-only";

/**
 * The Postgres adapter.
 *
 * Composed from the modules under `./pg/`, each of which owns one slice of the
 * store and is verified against a real database. Together they must present
 * exactly the surface of `./local.ts` — that file is the reference
 * implementation and the contract.
 *
 * Nothing imports this yet: `./index.ts` still resolves to the local store.
 * Wiring it in is a one-line change there once every module below is present
 * and the acceptance tests in `tests/integration/postgres-adapter.test.ts`
 * pass against a migrated database.
 *
 * ASSEMBLY IN PROGRESS — the remaining modules (awards, obligations, ops) are
 * being written. Until all four are exported here this adapter is incomplete
 * and must not be selected at runtime.
 */

export * from "./pg/identity";
