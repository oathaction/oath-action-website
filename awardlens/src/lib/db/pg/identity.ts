import "server-only";

import { randomUUID } from "node:crypto";

import type { Organization, Profile } from "@/lib/domain/types";

import { getSql, toIso } from "./client";

/**
 * Identity: profiles, organisations, membership and sign-in codes.
 *
 * The Postgres counterpart of the profile/organisation/login half of
 * `src/lib/db/local.ts`. Signatures and observable behaviour match that module
 * exactly; where this one has to depart, the reason is written down at the
 * point of departure.
 *
 * Two properties are load bearing:
 *
 *   * every lookup is scoped in SQL, never by the caller. `isMember` resolves
 *     membership with both ids in the WHERE clause, and nothing here will hand
 *     back a row belonging to an organisation the caller did not name;
 *   * identity columns are never updated. `updateProfile` cannot move a profile
 *     to another id and `renameOrganization` writes `name` and nothing else, so
 *     no patch can migrate a row between tenants.
 */

/* ---------------------------------------------------------------- rows --- */

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface LoginCodeRow {
  code_hash: string;
  attempts: number;
  expired: boolean;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/* ------------------------------------------------------------- helpers --- */

export function newId(): string {
  return randomUUID();
}

/** Addresses are stored lowercase (profiles_email_lowercase enforces it). */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Departs from the reference in code so as to match it in behaviour: a string
 * that is not a uuid identifies no row, but Postgres answers a malformed uuid
 * with error 22P02 rather than an empty result. Screening it here keeps "no
 * such record" a null/false answer, which is what the file-backed store gives.
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Identical to the reference's, so the same name produces the same slug. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "organisation"
  );
}

function isSlugConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; constraint_name?: unknown };
  return candidate.code === "23505" && candidate.constraint_name === "organizations_slug_key";
}

/**
 * Test helper: drops all stored state.
 *
 * One statement, built server-side from `pg_tables` rather than from a hard
 * coded list, so a table added by a later migration cannot quietly survive a
 * reset and leak into the next test. `auth.users` is appended because profiles
 * reference it (see `createProfile`) and the stub lives outside `public`.
 * TRUNCATE empties tables without touching their definitions, so the schema,
 * its constraints and its triggers are all still there afterwards.
 *
 * No user input reaches the statement: the identifiers come from the catalogue
 * and are quoted with `format('%I')`.
 */
export async function __resetStore(): Promise<void> {
  const sql = getSql();
  await sql`
    do $$
    declare
      statement text;
    begin
      select 'truncate table '
             || coalesce(
                  string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) || ', ',
                  ''
                )
             || 'auth.users restart identity cascade'
        into statement
        from pg_tables
       where schemaname = 'public';

      execute statement;
    end
    $$;
  `;
}

/* ------------------------------------------------------------- profiles -- */

export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const sql = getSql();
  const rows = await sql<ProfileRow[]>`
    select id, email, full_name, created_at, updated_at
      from public.profiles
     where email = ${normaliseEmail(email)}
  `;
  return rows.length > 0 ? mapProfile(rows[0]) : null;
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (!isUuid(id)) return null;
  const sql = getSql();
  const rows = await sql<ProfileRow[]>`
    select id, email, full_name, created_at, updated_at
      from public.profiles
     where id = ${id}
  `;
  return rows.length > 0 ? mapProfile(rows[0]) : null;
}

/**
 * `profiles.id` carries a foreign key to `auth.users(id)`, a table this product
 * does not otherwise use — AwardLens authenticates with its own emailed codes,
 * not Supabase Auth. The referenced row therefore has to be created here, and
 * it has to be created in the same transaction as the profile: an auth.users
 * row with no profile is an orphan that nothing will ever clean up, and a
 * failed profile insert (a duplicate address, say) must not leave one behind.
 */
export async function createProfile(email: string, fullName: string | null): Promise<Profile> {
  const sql = getSql();
  const normalised = normaliseEmail(email);
  const id = newId();

  return sql.begin(async (tx) => {
    await tx`insert into auth.users (id, email) values (${id}, ${normalised})`;
    const rows = await tx<ProfileRow[]>`
      insert into public.profiles (id, email, full_name)
      values (${id}, ${normalised}, ${fullName})
      returning id, email, full_name, created_at, updated_at
    `;
    return mapProfile(rows[0]);
  });
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "fullName">>,
): Promise<Profile | null> {
  if (!isUuid(id)) return null;
  const sql = getSql();

  // Only `fullName` is patchable, and only when the caller actually supplied it
  // — `{ fullName: null }` clears the name, an absent key leaves it alone,
  // which an ordinary coalesce could not tell apart. `id` is never in the SET
  // list, so this cannot move a profile onto another identity.
  const setFullName = "fullName" in patch ? sql`, full_name = ${patch.fullName ?? null}` : sql``;

  const rows = await sql<ProfileRow[]>`
    update public.profiles
       set updated_at = now()${setFullName}
     where id = ${id}
    returning id, email, full_name, created_at, updated_at
  `;
  return rows.length > 0 ? mapProfile(rows[0]) : null;
}

/* -------------------------------------------------------- organizations -- */

export async function getOrganization(id: string): Promise<Organization | null> {
  if (!isUuid(id)) return null;
  const sql = getSql();
  const rows = await sql<OrganizationRow[]>`
    select id, name, slug, created_by, created_at, updated_at
      from public.organizations
     where id = ${id}
  `;
  return rows.length > 0 ? mapOrganization(rows[0]) : null;
}

export async function isMember(organizationId: string, userId: string): Promise<boolean> {
  if (!isUuid(organizationId) || !isUuid(userId)) return false;
  const sql = getSql();
  // Both halves of the membership are in the WHERE clause: this is the query
  // the rest of the application's authorisation rests on.
  const rows = await sql<{ is_member: boolean }[]>`
    select exists (
      select 1
        from public.organization_members
       where organization_id = ${organizationId}
         and user_id = ${userId}
    ) as is_member
  `;
  return rows[0].is_member;
}

/**
 * After 50 collisions on the same base slug, retrying is no longer plausibly
 * fixing a race, so the underlying unique violation is allowed to surface.
 */
const MAX_SLUG_ATTEMPTS = 50;

/** The MVP gives every user exactly one organisation, created on first sign-in. */
export async function getOrCreateOrganizationForUser(
  userId: string,
  suggestedName: string,
): Promise<Organization> {
  const sql = getSql();

  // One transaction: an organisation without its owner membership row is
  // unreachable — nothing in the product can read it, and `isMember` says no —
  // so the two rows are written together or not at all.
  return sql.begin(async (tx) => {
    const findExisting = () => tx<OrganizationRow[]>`
      select o.id, o.name, o.slug, o.created_by, o.created_at, o.updated_at
        from public.organizations o
        join public.organization_members m on m.organization_id = o.id
       where m.user_id = ${userId}
       -- The reference returns the user's first membership; ordering makes
       -- "first" mean the same thing on every call rather than whatever the
       -- planner returns.
       order by m.created_at, o.id
       limit 1
    `;

    const existing = await findExisting();
    if (existing.length > 0) return mapOrganization(existing[0]);

    // The reference decides and creates in one synchronous step, so it cannot
    // give a user two organisations. Here the check and the insert are separate
    // statements, and a first sign-in that fires two requests at once would
    // otherwise create one organisation each. An advisory lock keyed on the
    // user closes that window; it is taken only on the create path, and the
    // second holder re-reads and finds the organisation the first one
    // committed. `hashtext` can collide, which costs an unrelated user a brief
    // wait and nothing else.
    await tx`select pg_advisory_xact_lock(hashtext(${userId})::bigint)`;
    const raced = await findExisting();
    if (raced.length > 0) return mapOrganization(raced[0]);

    const base = slugify(suggestedName);
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      // Same suffix strategy as the reference: base, then base-2, base-3, ...
      const slug = attempt === 1 ? base : `${base}-${attempt}`;
      try {
        // Insert first and let the unique index decide, instead of checking for
        // the slug and then inserting: two sign-ups racing on the same name
        // both pass a pre-flight check and one of them then fails. The
        // savepoint is what makes the retry possible — an error would otherwise
        // abort the whole transaction, taking the membership insert with it.
        const created = await tx.savepoint(async (sp) => {
          const rows = await sp<OrganizationRow[]>`
            insert into public.organizations (id, name, slug, created_by)
            values (${newId()}, ${suggestedName}, ${slug}, ${userId})
            returning id, name, slug, created_by, created_at, updated_at
          `;
          return rows[0];
        });

        await tx`
          insert into public.organization_members (organization_id, user_id, role)
          values (${created.id}, ${userId}, 'owner')
        `;
        return mapOrganization(created);
      } catch (error) {
        if (!isSlugConflict(error)) throw error;
        lastError = error;
      }
    }

    throw lastError;
  });
}

export async function renameOrganization(
  organizationId: string,
  name: string,
): Promise<Organization | null> {
  if (!isUuid(organizationId)) return null;
  const sql = getSql();
  // `name` only. Nothing here can rewrite `id` or `created_by`, so a rename
  // cannot be turned into a change of ownership. `updated_at` is set by the
  // table's trigger as well; writing it here keeps the statement honest about
  // what it changes.
  const rows = await sql<OrganizationRow[]>`
    update public.organizations
       set name = ${name},
           updated_at = now()
     where id = ${organizationId}
    returning id, name, slug, created_by, created_at, updated_at
  `;
  return rows.length > 0 ? mapOrganization(rows[0]) : null;
}

/* ---------------------------------------------------------------- login -- */

/** Matches the reference's ceiling: a six-digit code gets five guesses. */
const MAX_LOGIN_CODE_ATTEMPTS = 5;

export async function saveLoginCode(
  email: string,
  codeHash: string,
  expiresAt: string,
): Promise<void> {
  const sql = getSql();
  // One outstanding code per address. Requesting a new one replaces the old
  // hash *and* resets the attempt counter, exactly as the reference's
  // delete-then-insert does — so a fresh code is a fresh five guesses, and an
  // old code stops working the moment a new one is sent.
  await sql`
    insert into public.login_codes (email, code_hash, expires_at, attempts, created_at)
    values (${normaliseEmail(email)}, ${codeHash}, ${expiresAt}::timestamptz, 0, now())
    on conflict (email) do update
       set code_hash = excluded.code_hash,
           expires_at = excluded.expires_at,
           attempts = 0,
           created_at = now()
  `;
}

export async function consumeLoginCode(
  email: string,
  codeHash: string,
): Promise<"ok" | "invalid" | "expired" | "too_many_attempts"> {
  const sql = getSql();
  const normalised = normaliseEmail(email);

  // One transaction, and the row is locked for the length of it. Two attempts
  // arriving together cannot both be told "ok": the second waits for the first
  // to commit, then reads a row that is no longer there.
  return sql.begin(async (tx) => {
    const rows = await tx<LoginCodeRow[]>`
      select code_hash,
             attempts,
             -- Expiry is decided by the database clock rather than the
             -- application's. The reference has only one clock to consult; here
             -- there may be several application instances, and the row's own
             -- server is the one that should rule on it.
             expires_at < now() as expired
        from public.login_codes
       where email = ${normalised}
       for update
    `;

    const entry = rows[0];
    if (!entry) return "invalid";

    // Precedence follows the reference: the attempt ceiling is checked before
    // expiry, so a locked-out address is never told "expired" — which would
    // invite it to request a fresh code and start guessing again.
    if (entry.attempts >= MAX_LOGIN_CODE_ATTEMPTS) return "too_many_attempts";

    if (entry.expired) {
      await tx`delete from public.login_codes where email = ${normalised}`;
      return "expired";
    }

    if (entry.code_hash !== codeHash) {
      await tx`update public.login_codes set attempts = attempts + 1 where email = ${normalised}`;
      return "invalid";
    }

    // Consumed on success: a correct code works exactly once.
    await tx`delete from public.login_codes where email = ${normalised}`;
    return "ok";
  });
}
