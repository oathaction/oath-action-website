import "server-only";

import postgres from "postgres";

import { getServerConfig } from "@/lib/env";

/**
 * Postgres connection and row mapping.
 *
 * The adapter connects directly to Postgres with the service role rather than
 * going through PostgREST. That choice matters for authorisation: RLS policies
 * key off `auth.uid()`, which a direct server-side connection does not carry,
 * so **row-level security is not what protects tenants on this path**. Every
 * query below scopes by `organization_id` in its WHERE clause, exactly as the
 * file-backed store does, and that is the enforcement.
 *
 * RLS remains valuable and is not redundant: it is the backstop for anything
 * that reaches the database as an authenticated user — the Supabase client
 * libraries, the SQL editor, a future browser-side read — and it is what makes
 * a mistake in this file a bug rather than a breach.
 */

/**
 * The connection type carries our custom `date` mapping, so it is derived from
 * the actual configuration rather than declared as the bare default — otherwise
 * every query's inferred row types disagree with what the driver really returns.
 */
export type Sql = postgres.Sql<{ date: string }>;

const globalForSql = globalThis as unknown as { __awardlensSql?: Sql };

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set, so the Postgres adapter cannot connect.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function getSql(): Sql {
  if (globalForSql.__awardlensSql) return globalForSql.__awardlensSql;

  const url = getServerConfig().databaseUrl;
  if (!url) throw new DatabaseNotConfiguredError();

  globalForSql.__awardlensSql = postgres(url, {
    // Serverless invocations are short-lived; a large pool just exhausts the
    // database's connection limit under concurrency.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    // Dates are handled as ISO strings throughout the domain model. Returning
    // them as JS Date objects would reintroduce the timezone drift that
    // `formatIsoDate` exists to avoid.
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (value: string) => value,
        parse: (value: string) => value,
      },
    },
    onnotice: () => {},
  }) as Sql;

  return globalForSql.__awardlensSql;
}

/** Test helper: closes the pool so a suite can exit cleanly. */
export async function closeSql(): Promise<void> {
  if (!globalForSql.__awardlensSql) return;
  await globalForSql.__awardlensSql.end({ timeout: 5 });
  globalForSql.__awardlensSql = undefined;
}

/* ------------------------------------------------------------- mapping --- */

/** Postgres timestamptz → ISO string, the shape the domain model uses. */
export function toIso(value: Date | string | null): string {
  if (value === null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toIsoOrNull(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Postgres `date` → `YYYY-MM-DD`, never shifted by a timezone. */
export function toDateOrNull(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Postgres `numeric` arrives as a string to preserve precision. */
export function toNumberOrNull(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNumber(value: string | number | null, fallback = 0): number {
  return toNumberOrNull(value) ?? fallback;
}
