-- =============================================================================
-- AwardLens — login codes
-- =============================================================================
--
-- 0001-0004 were written on the assumption that Supabase Auth issued and
-- verified sign-in credentials, which is why `profiles.id` references
-- auth.users and why no table here holds a one-time code. That assumption is
-- wrong for this product: AwardLens runs its own emailed-code sign-in
-- (src/lib/auth, src/app/actions/auth.ts), and the file-backed store keeps the
-- outstanding codes in its `loginCodes` collection. The Postgres adapter needs
-- the same storage, so the table the earlier migrations omitted is added here.
--
-- One row per email address: requesting a new code replaces the outstanding one
-- rather than accumulating candidates, so `email` is the primary key and there
-- is no surrogate id. Only the hash of the code is stored — the code itself
-- exists in the recipient's inbox and nowhere else.
--
-- Safe to re-run: every object is created with `if not exists` or an equivalent
-- guard.
-- =============================================================================

create table if not exists public.login_codes (
  email      text primary key,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  created_at timestamptz not null default now()
);

comment on column public.login_codes.code_hash is
  'Keyed hash of the emailed code (lib/auth hashLoginCode). The plaintext code is never stored, so a database leak does not hand out sign-ins.';
comment on column public.login_codes.expires_at is
  'Absolute expiry. The adapter deletes the row when the code is used and when it is found expired, so a used code cannot be replayed.';
comment on column public.login_codes.attempts is
  'Wrong-code attempts against this row. The adapter refuses the code once this reaches 5, which is what stops a six-digit code being guessed.';

-- -----------------------------------------------------------------------------
-- SERVICE ROLE ONLY
--
-- RLS is enabled and there is deliberately NO POLICY of any kind, exactly as
-- for processed_stripe_events in 0002. With RLS on and no policy, `anon` and
-- `authenticated` get zero rows on select and an error on write.
--
-- That is not tidiness, it is the security boundary. This table holds
-- authentication material: anyone able to insert a row could mint a code hash
-- for somebody else's address and sign in as them, anyone able to update one
-- could reset `attempts` and brute-force a six-digit code, and anyone able to
-- read one gets an offline target. None of those roles has any legitimate
-- reason to touch it — the only code that does is the server-side sign-in path,
-- which connects as the service role. Do not add a policy here.
-- -----------------------------------------------------------------------------

alter table public.login_codes enable row level security;

revoke all on table public.login_codes from anon, authenticated;

comment on table public.login_codes is
  'Outstanding emailed sign-in codes, one per address. SERVICE ROLE ONLY: RLS is enabled with no policy because the table holds authentication material.';
