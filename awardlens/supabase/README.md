# AwardLens — Supabase / Postgres

The production data layer. The application currently runs on the file-backed
store in `src/lib/db/local.ts`; this directory is its Postgres equivalent, with
the organisation scoping that store enforces in TypeScript re-expressed as
row-level security so it also holds when something talks to the database
directly.

```
supabase/
  migrations/
    0001_initial_schema.sql       tables, enums, indexes, updated_at triggers
    0002_row_level_security.sql   RLS: the security-critical file
    0003_storage.sql              private award-documents bucket + object policies
  seed.sql                        small demo dataset for a fresh local project
```

Migrations are ordinary SQL and are applied in filename order. They are written
to be re-runnable: `create table if not exists`, guarded `create type`, and
`drop policy if exists` before every `create policy`.

## Applying

### Local

```bash
supabase start                # boots Postgres, Auth, Storage, Studio, mail catcher
supabase db reset             # drops, re-applies every migration, then runs seed.sql
```

`supabase db reset` is the loop to use while changing the schema — it proves the
migrations work from nothing every time, which editing the database by hand does
not.

Useful local endpoints once `supabase start` is up:

| What | Where |
| --- | --- |
| Studio | http://localhost:54323 |
| Postgres | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Mail catcher (login codes) | http://localhost:54324 |

### A hosted project

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push               # applies any migrations the remote has not seen
```

Check what would run first:

```bash
supabase migration list        # local vs remote migration state
supabase db diff --linked      # drift between this directory and the remote
```

Do **not** run `seed.sql` against a hosted project that has real data. It is
guarded (it does nothing when any organisation already exists) but it is a demo
fixture, not a fixup script.

### Environment

The app needs the project URL and the anon key for user-facing requests. The
service role key is only for server-only paths — the Stripe webhook, the
reminder cron, and organisation data deletion — and must never appear in a
`NEXT_PUBLIC_*` variable, a client bundle, or a response body. **The service
role bypasses every policy in `0002`.** If a request runs on behalf of a
signed-in user, it must carry that user's token, not the service key.

## What is in the schema

Sixteen tables, all in `public`:

| Table | Notes |
| --- | --- |
| `profiles` | keyed by `auth.users.id`, cascade on user delete |
| `organizations`, `organization_members` | membership is the root of all authorisation |
| `awards` | one per grant agreement |
| `documents`, `document_segments` | uploaded file metadata and its parsed slices |
| `processing_runs` | one extraction attempt, with stage, status and token usage |
| `obligations`, `obligation_citations` | the register and the evidence behind each row |
| `reminders` | scheduled emails, one per (obligation, user, offset) |
| `subscriptions`, `processed_stripe_events` | billing state and webhook idempotency |
| `exports`, `audit_events` | what left the system, and what happened |
| `notification_preferences`, `ask_exchanges` | per-user settings, per-award Q&A history |

Enums mirror the string unions in `src/lib/domain/types.ts` exactly, so an
invalid category or status cannot be stored at all.

Two structural decisions worth knowing before you edit anything:

* **`organization_id` is denormalised onto every organisation-owned table**,
  including `documents`, `obligations`, `reminders`, `exports`, `ask_exchanges`
  and `processing_runs`, even where it is derivable through a parent. It exists
  so RLS can authorise with one indexed predicate instead of a join. When you
  insert into these tables, set it — and the `with check` clauses make sure it
  is set to an organisation you belong to.
* **`document_segments` and `obligation_citations` deliberately have no
  `organization_id`.** They are authorised with an `exists` check against their
  parent. If you add a table under `documents` or `obligations`, follow the same
  pattern or add the column; do not leave it unpoliced.

## Policy strategy in one paragraph

Every table has RLS enabled. Every organisation-owned table answers one
question: `public.is_org_member(organization_id)`. That helper is
`security definer` (so a policy on `organization_members` can query
`organization_members` without recursing) and pins `search_path` (so nothing
can shadow the objects its body uses and get them executed as the owner).
`profiles` is narrower still — you can only see and edit your own row. Billing
rows are readable by members and writable only by the service role, so nobody
can grant themselves a plan. `audit_events` is insert-and-select only, so the
record cannot be edited by the person it describes. `processed_stripe_events`
has RLS on and **no policy at all**: only the service role can touch it.

Creating an organisation goes through `public.create_organization(name)`, a
`security definer` function that writes the organisation and its owner
membership together. There is no insert policy on `organizations` and no
"add yourself when you are not a member yet" branch on `organization_members`,
because any policy loose enough to admit the first membership row is also loose
enough to let anyone join somebody else's organisation as owner.

## Verifying RLS is actually on

Run these after every schema change. All three should return nothing.

```sql
-- 1. Any table in public without row-level security enabled.
select tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false;

-- 2. Any table with RLS enabled but no policies. processed_stripe_events is the
--    one expected row here: it is service-role only, by design.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  );

-- 3. Any security definer function in public with a mutable search_path.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) c
    where c like 'search_path=%'
  );
```

And to read the policies themselves:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by tablename, policyname;
```

Supabase Studio's Advisors page (Security) runs equivalent checks and will also
flag anything added later without RLS.

## Negative tests

The full list lives as comments at the end of
`migrations/0002_row_level_security.sql` and `migrations/0003_storage.sql`.
Run them after any change to either file. The short version:

1. A member of org B lists org A's awards → 0 rows.
2. The same member selects org A's award by its exact id → 0 rows.
3. An unauthenticated (`anon`) select on every table → 0 rows, and no
   "permission denied for function" errors.
4. Guessing an org A document id, and its `document_segments` rows → 0 rows
   from both (this is the one that proves the child-table `exists` policy).
5. Reading `obligation_citations` by a guessed obligation id → 0 rows.
6. Inserting an award into org A → `new row violates row-level security policy`.
7. `update ... set organization_id = '<org A>'` on your own award → violation.
8. `update subscriptions set plan = 'team'` → permission denied.
9. `delete from audit_events` / `update audit_events` → permission denied.
10. Selecting or inserting into `processed_stripe_events` → 0 rows, then denied.
11. Selecting or updating another user's `profiles` row → 0 rows.
12. `insert into organization_members (... , 'owner')` aimed at org A →
    violation. **This test found a real hole during development** — an earlier
    draft of the membership policy allowed it. Keep it in the suite.
13. `insert into organizations` directly → permission denied;
    `select public.create_organization('X')` → succeeds, with the caller as
    owner and nobody else.
14. Storage: listing objects under another organisation's prefix → 0 rows;
    writing there → violation; writing a malformed name (`not-a-path`,
    `organizations/../…`, `organizations/not-a-uuid/…`) → violation, never an
    `invalid input syntax for type uuid` error.

Run them as a role, not as `postgres`. `postgres` is the table owner and is not
subject to these policies, so running the suite as `postgres` produces a
comfortable false pass:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';
  -- ... checks ...
rollback;
```

`set local` only applies inside a transaction, and the rollback means the write
attempts leave nothing behind.

## Storage

`0003_storage.sql` creates one private bucket, `award-documents`, with a 15 MB
limit and the four accepted mime types — the same limits as
`src/lib/documents/validation.ts`, repeated here because the storage API can be
called without going through the application.

Object paths must follow:

```
organizations/{organizationId}/awards/{awardId}/{documentId}/{filename}
```

The policies parse the organisation id out of segment 2 and check membership.
A path that does not match resolves to `null` and is denied — the cast is
guarded, so a hostile name cannot raise an error inside a policy.

There is no update policy: documents are immutable once written. A corrected
file is a new `documents` row and a new object, so the bytes a citation points
at cannot change after review. Browsers never read the bucket directly; the
server issues signed URLs.

## Deleting a user

`profiles.id` cascades from `auth.users`, and rows that belong to a user
(`reminders`, `notification_preferences`, `organization_members`,
`ask_exchanges`) cascade with the profile. Rows that belong to an *organisation*
but record who created them (`organizations.created_by`, `awards.created_by`,
`exports.generated_by`) use `on delete restrict`, so deleting the auth user will
fail loudly rather than silently destroying, or orphaning, an organisation's
compliance record.

That is deliberate. The order for a real deletion request is:

1. Run the organisation data deletion path (the equivalent of
   `deleteOrganizationData` in `src/lib/db/local.ts`) for any organisation the
   user solely owns, or transfer ownership to another member.
2. Remove the membership rows.
3. Delete the auth user, which cascades to the profile.

If step 3 errors with a foreign key violation, something in step 1 was missed.
That is the constraint doing its job.

## Seed data

`seed.sql` creates one demo organisation, "Riverside Community Trust (demo)",
with two users, one award, one document with three segments, three obligations
with citations, two scheduled reminders, a subscription, an ask exchange, an
export record and a few audit events. Every value is invented; none of it is
real award data.

The demo accounts (`dana.owner@awardlens.test`, `sam.member@awardlens.test`)
have no password. Sign in with the email code flow and read the message from the
local mail catcher at http://localhost:54324.

The whole script is wrapped in a guard: if any organisation already exists it
raises a notice and does nothing.

## Known gaps

* The one-time login codes in the local store have no table here. Production
  uses Supabase Auth (OTP / magic link), so `auth.users` and GoTrue own that
  flow.
* `profiles` is readable only by its owner, so a member directory (showing an
  assignee's name to a colleague) needs either a server-side lookup or a narrow
  view exposing display names to shared organisations. Widening the `profiles`
  policy is the wrong fix.
* Membership administration allows an admin to promote themselves to owner.
  Acceptable at this size; if it stops being acceptable, restrict role changes
  to `owner` in `organization_members_update_admin`.
* An owner leaving is not prevented, so an organisation can end up with no
  owner. Handle it in the application before adding a trigger for it.
