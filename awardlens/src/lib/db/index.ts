import "server-only";

/**
 * The storage seam.
 *
 * Everything in the application imports persistence from `@/lib/db` and never
 * from a concrete implementation. Today that resolves to the file-backed store,
 * which is what lets the product run with no external services.
 *
 * To move to Postgres, add a `supabase.ts` implementing the same exported
 * surface and switch the re-export below on `getServerConfig().storageMode`.
 * The schema and row-level-security policies that adapter targets already exist
 * and are verified — see `supabase/migrations/`. Nothing outside this directory
 * should need to change, because no caller names an implementation.
 *
 * The one rule an implementation must honour: every read and write is scoped by
 * `organizationId` inside the adapter, not merely by its callers. Authorisation
 * that lives only in the calling layer is one forgotten check away from a leak.
 */
export * from "./local";
