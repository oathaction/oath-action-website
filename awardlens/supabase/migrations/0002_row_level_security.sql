-- =============================================================================
-- AwardLens — row-level security
-- =============================================================================
--
-- Threat model in one line: an authenticated user holds a JWT that reaches
-- Postgres as the `authenticated` role, and nothing but these policies stands
-- between that user and every other organisation's award documents. Application
-- code is a second line of defence, not the first.
--
-- Principles applied here:
--
--   1. Deny by default. RLS is enabled on every table in `public`, including
--      profiles and the Stripe idempotency ledger. A table with RLS enabled and
--      no matching policy returns zero rows and rejects writes.
--
--   2. Authorisation resolves to one predicate: `public.is_org_member(org)`.
--      There is one place to audit and one place to get wrong.
--
--   3. That helper is SECURITY DEFINER for a specific reason. A policy
--      expression is evaluated with the *caller's* row security still in
--      force, so a policy on organization_members that queried
--      organization_members would recurse. Running the lookup as the function
--      owner breaks the cycle. Because it is SECURITY DEFINER it must pin
--      search_path: a definer function with a mutable search_path lets any role
--      that can create objects in an earlier schema shadow a function or
--      operator the body uses and have it executed as the owner. That is a
--      privilege-escalation bug, so `set search_path = public, pg_temp` below
--      is load bearing, not decoration.
--
--   4. Money and audit rows are not member-writable. Members can read their
--      subscription but only the service role can write it; otherwise a user
--      could `update subscriptions set plan = 'team'` and grant themselves the
--      product. Audit events are insert-and-read only, so the record of what
--      happened cannot be edited by the person it incriminates.
--
-- THE SERVICE ROLE BYPASSES ALL OF THIS. `service_role` carries BYPASSRLS, so
-- every policy below is invisible to it. It is for server-only paths that have
-- no user in context — the Stripe webhook, the reminder cron, and organisation
-- data deletion — and its key must never be exposed to a browser, a client
-- bundle, a NEXT_PUBLIC_* variable, or an edge function that echoes input.
-- Anything running on behalf of a signed-in user must use that user's token so
-- these policies apply.
--
-- Safe to re-run: every policy is dropped before it is created.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorisation helpers
-- -----------------------------------------------------------------------------

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
  );
$$;

comment on function public.is_org_member(uuid) is
  'True when the current JWT subject belongs to the given organisation. SECURITY DEFINER to avoid RLS recursion on organization_members; search_path is pinned to prevent object shadowing. Returns false (never an error) for anon or a null argument.';

create or replace function public.org_role(org uuid)
returns public.organization_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = org
    and m.user_id = auth.uid();
$$;

comment on function public.org_role(uuid) is
  'The current user role in the given organisation, or null when they are not a member. Used to keep membership administration and organisation deletion away from ordinary members.';

-- Creating an organisation is the one operation that cannot be expressed as a
-- policy: the creator is not yet a member, so no membership predicate can be
-- true for them, and any policy loose enough to admit the first membership row
-- ("you may add yourself when you are not a member yet") also admits adding
-- yourself as owner of somebody else's organisation. So creation happens in one
-- SECURITY DEFINER function that writes both rows atomically and hard-codes the
-- parts an attacker would want to choose: created_by and the owner role.
create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_base text;
  v_slug text;
  v_n    integer := 2;
  v_org  public.organizations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'organisation name is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'no profile for the current user' using errcode = '23503';
  end if;

  v_base := coalesce(
    nullif(left(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), 40), ''),
    'organisation'
  );
  v_base := btrim(v_base, '-');
  v_slug := v_base;
  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_slug := v_base || '-' || v_n;
    v_n := v_n + 1;
  end loop;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), v_slug, v_uid)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_uid, 'owner');

  return v_org;
end;
$$;

comment on function public.create_organization(text) is
  'Creates an organisation and its owner membership in one transaction, for the calling user only. The only supported way for a client to create an organisation: the tables themselves grant no insert to authenticated.';

revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated, service_role;

-- Both helpers only ever report on auth.uid(), so exposing them to anon leaks
-- nothing and keeps unauthenticated reads returning "zero rows" rather than
-- "permission denied for function", which is what the negative tests assert.
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.org_role(uuid) from public;
grant execute on function public.is_org_member(uuid) to anon, authenticated, service_role;
grant execute on function public.org_role(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere. No exceptions, including profiles.
-- -----------------------------------------------------------------------------

alter table public.profiles                 enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_members     enable row level security;
alter table public.awards                   enable row level security;
alter table public.documents                enable row level security;
alter table public.document_segments        enable row level security;
alter table public.processing_runs          enable row level security;
alter table public.obligations              enable row level security;
alter table public.obligation_citations     enable row level security;
alter table public.reminders                enable row level security;
alter table public.subscriptions            enable row level security;
alter table public.exports                  enable row level security;
alter table public.audit_events             enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.ask_exchanges            enable row level security;
alter table public.processed_stripe_events  enable row level security;

-- -----------------------------------------------------------------------------
-- profiles — your own row, and only your own row
--
-- Deliberately narrow: a member cannot read a colleague's profile. Anywhere the
-- UI needs another member's name (an obligation assignee, an audit actor) the
-- server resolves it and returns just the display name. If joined member
-- directories are needed later, add a view restricted to shared organisations
-- rather than widening this policy.
-- -----------------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy. Account deletion is a server-side workflow that removes the
-- auth user (which cascades to the profile) after organisation data is handled.

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

-- No insert policy, deliberately. Direct inserts would leave organisations with
-- no members (invisible junk rows), and any policy permissive enough to let the
-- creator add the first membership row is the same policy that lets anyone join
-- an existing organisation. Clients call public.create_organization(name);
-- first-sign-in provisioning on the server may also use the service role.
drop policy if exists organizations_insert_self on public.organizations;
revoke insert on table public.organizations from anon, authenticated;

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.org_role(id) in ('owner', 'admin'))
  with check (public.org_role(id) in ('owner', 'admin'));

-- Deleting an organisation cascades every award, document and obligation in it.
-- Owners only.
drop policy if exists organizations_delete_owner on public.organizations;
create policy organizations_delete_owner on public.organizations
  for delete to authenticated
  using (public.org_role(id) = 'owner');

-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------

drop policy if exists organization_members_select_member on public.organization_members;
create policy organization_members_select_member on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Only an existing owner or admin may add a member.
--
-- There is no "you may add yourself if you are not a member yet" branch. That
-- reads like harmless bootstrapping and is in fact a full account takeover:
-- `org_role(<any org>)` is null for a non-member, so the branch would let any
-- authenticated user insert themselves as owner of any organisation whose id
-- they can guess. The first owner row is written by
-- public.create_organization() instead. (A negative test caught this; it is
-- test 12 at the end of this file. Keep running it.)
drop policy if exists organization_members_insert_admin on public.organization_members;
create policy organization_members_insert_admin on public.organization_members
  for insert to authenticated
  with check (public.org_role(organization_id) in ('owner', 'admin'));

drop policy if exists organization_members_update_admin on public.organization_members;
create policy organization_members_update_admin on public.organization_members
  for update to authenticated
  using (public.org_role(organization_id) in ('owner', 'admin'))
  with check (public.org_role(organization_id) in ('owner', 'admin'));

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin on public.organization_members
  for delete to authenticated
  using (
    public.org_role(organization_id) in ('owner', 'admin')
    or user_id = auth.uid() -- anyone may leave an organisation
  );

-- -----------------------------------------------------------------------------
-- awards
-- -----------------------------------------------------------------------------

drop policy if exists awards_select_member on public.awards;
create policy awards_select_member on public.awards
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists awards_insert_member on public.awards;
create policy awards_insert_member on public.awards
  for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = auth.uid());

drop policy if exists awards_update_member on public.awards;
create policy awards_update_member on public.awards
  for update to authenticated
  using (public.is_org_member(organization_id))
  -- The WITH CHECK clause is what stops a member moving a row into, or out of,
  -- another organisation with an UPDATE.
  with check (public.is_org_member(organization_id));

drop policy if exists awards_delete_member on public.awards;
create policy awards_delete_member on public.awards
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------

drop policy if exists documents_select_member on public.documents;
create policy documents_select_member on public.documents
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists documents_insert_member on public.documents;
create policy documents_insert_member on public.documents
  for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists documents_update_member on public.documents;
create policy documents_update_member on public.documents
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists documents_delete_member on public.documents;
create policy documents_delete_member on public.documents
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- document_segments — no organization_id of its own
--
-- Ownership is proved through the parent document. The EXISTS subquery is
-- itself subject to the documents policies, so this is two independent checks
-- agreeing: the row's document must be visible AND its organisation must be
-- one the caller belongs to.
-- -----------------------------------------------------------------------------

drop policy if exists document_segments_select_member on public.document_segments;
create policy document_segments_select_member on public.document_segments
  for select to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_segments.document_id
        and public.is_org_member(d.organization_id)
    )
  );

drop policy if exists document_segments_insert_member on public.document_segments;
create policy document_segments_insert_member on public.document_segments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = document_segments.document_id
        and public.is_org_member(d.organization_id)
    )
  );

drop policy if exists document_segments_update_member on public.document_segments;
create policy document_segments_update_member on public.document_segments
  for update to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_segments.document_id
        and public.is_org_member(d.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = document_segments.document_id
        and public.is_org_member(d.organization_id)
    )
  );

drop policy if exists document_segments_delete_member on public.document_segments;
create policy document_segments_delete_member on public.document_segments
  for delete to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_segments.document_id
        and public.is_org_member(d.organization_id)
    )
  );

-- -----------------------------------------------------------------------------
-- processing_runs
-- -----------------------------------------------------------------------------

drop policy if exists processing_runs_select_member on public.processing_runs;
create policy processing_runs_select_member on public.processing_runs
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists processing_runs_insert_member on public.processing_runs;
create policy processing_runs_insert_member on public.processing_runs
  for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists processing_runs_update_member on public.processing_runs;
create policy processing_runs_update_member on public.processing_runs
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists processing_runs_delete_member on public.processing_runs;
create policy processing_runs_delete_member on public.processing_runs
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- obligations
-- -----------------------------------------------------------------------------

drop policy if exists obligations_select_member on public.obligations;
create policy obligations_select_member on public.obligations
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists obligations_insert_member on public.obligations;
create policy obligations_insert_member on public.obligations
  for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists obligations_update_member on public.obligations;
create policy obligations_update_member on public.obligations
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists obligations_delete_member on public.obligations;
create policy obligations_delete_member on public.obligations
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- obligation_citations — no organization_id of its own, same pattern as segments
-- -----------------------------------------------------------------------------

drop policy if exists obligation_citations_select_member on public.obligation_citations;
create policy obligation_citations_select_member on public.obligation_citations
  for select to authenticated
  using (
    exists (
      select 1
      from public.obligations o
      where o.id = obligation_citations.obligation_id
        and public.is_org_member(o.organization_id)
    )
  );

drop policy if exists obligation_citations_insert_member on public.obligation_citations;
create policy obligation_citations_insert_member on public.obligation_citations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.obligations o
      where o.id = obligation_citations.obligation_id
        and public.is_org_member(o.organization_id)
    )
  );

drop policy if exists obligation_citations_update_member on public.obligation_citations;
create policy obligation_citations_update_member on public.obligation_citations
  for update to authenticated
  using (
    exists (
      select 1
      from public.obligations o
      where o.id = obligation_citations.obligation_id
        and public.is_org_member(o.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.obligations o
      where o.id = obligation_citations.obligation_id
        and public.is_org_member(o.organization_id)
    )
  );

drop policy if exists obligation_citations_delete_member on public.obligation_citations;
create policy obligation_citations_delete_member on public.obligation_citations
  for delete to authenticated
  using (
    exists (
      select 1
      from public.obligations o
      where o.id = obligation_citations.obligation_id
        and public.is_org_member(o.organization_id)
    )
  );

-- -----------------------------------------------------------------------------
-- reminders
--
-- Members manage their organisation's schedule; the send worker runs as the
-- service role and is not constrained by these policies.
-- -----------------------------------------------------------------------------

drop policy if exists reminders_select_member on public.reminders;
create policy reminders_select_member on public.reminders
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists reminders_insert_member on public.reminders;
create policy reminders_insert_member on public.reminders
  for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists reminders_update_member on public.reminders;
create policy reminders_update_member on public.reminders
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists reminders_delete_member on public.reminders;
create policy reminders_delete_member on public.reminders
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- subscriptions — readable by members, writable only by the service role
--
-- A member-writable billing row is a self-service upgrade to any plan. Stripe
-- webhooks are the only writer, and they run with the service role.
-- -----------------------------------------------------------------------------

drop policy if exists subscriptions_select_member on public.subscriptions;
create policy subscriptions_select_member on public.subscriptions
  for select to authenticated
  using (public.is_org_member(organization_id));

-- No insert, update or delete policy for authenticated. Belt and braces: also
-- remove the table-level write privileges Supabase grants by default.
revoke insert, update, delete on table public.subscriptions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- exports
-- -----------------------------------------------------------------------------

drop policy if exists exports_select_member on public.exports;
create policy exports_select_member on public.exports
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists exports_insert_member on public.exports;
create policy exports_insert_member on public.exports
  for insert to authenticated
  with check (public.is_org_member(organization_id) and generated_by = auth.uid());

drop policy if exists exports_delete_member on public.exports;
create policy exports_delete_member on public.exports
  for delete to authenticated
  using (public.is_org_member(organization_id));

-- Export rows are a record of what left the system; they are not editable.
revoke update on table public.exports from anon, authenticated;

-- -----------------------------------------------------------------------------
-- audit_events — append only
--
-- Members can read their organisation's history and add to it. Nobody but the
-- service role can rewrite or erase it.
-- -----------------------------------------------------------------------------

drop policy if exists audit_events_select_member on public.audit_events;
create policy audit_events_select_member on public.audit_events
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists audit_events_insert_member on public.audit_events;
create policy audit_events_insert_member on public.audit_events
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and (user_id is null or user_id = auth.uid())
  );

revoke update, delete on table public.audit_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- notification_preferences — your own preferences, inside an organisation you
-- belong to
-- -----------------------------------------------------------------------------

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own on public.notification_preferences
  for delete to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- ask_exchanges
--
-- Organisation-visible: the answer history for an award is shared context for
-- the team, so members read the whole award's exchanges but can only write
-- their own.
-- -----------------------------------------------------------------------------

drop policy if exists ask_exchanges_select_member on public.ask_exchanges;
create policy ask_exchanges_select_member on public.ask_exchanges
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists ask_exchanges_insert_member on public.ask_exchanges;
create policy ask_exchanges_insert_member on public.ask_exchanges
  for insert to authenticated
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

drop policy if exists ask_exchanges_delete_own on public.ask_exchanges;
create policy ask_exchanges_delete_own on public.ask_exchanges
  for delete to authenticated
  using (public.is_org_member(organization_id) and user_id = auth.uid());

-- A recorded answer is not editable after the fact.
revoke update on table public.ask_exchanges from anon, authenticated;

-- -----------------------------------------------------------------------------
-- processed_stripe_events — SERVICE ROLE ONLY
--
-- RLS is enabled and there is deliberately NO POLICY of any kind. With RLS on
-- and no policy, `authenticated` and `anon` get zero rows on select and an
-- error on write, no matter what the application does. Only the service role,
-- which bypasses RLS, can claim an event id — which is exactly the property the
-- webhook's idempotency depends on. Do not add a policy here.
-- -----------------------------------------------------------------------------

revoke all on table public.processed_stripe_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Optional extra hardening, not enabled by default:
--
--   alter table public.<name> force row level security;
--
-- makes policies apply to the table owner as well. Leave it off unless you have
-- verified that migrations, backups and the seed script still run, because the
-- owner role is what applies them.
-- =============================================================================


-- =============================================================================
-- NEGATIVE TESTS — run these after every change to this file
-- =============================================================================
--
-- These must all FAIL to return data. Run them in the SQL editor, or in psql,
-- impersonating a role rather than as postgres (postgres bypasses RLS and will
-- happily show you everything, which is the classic false pass).
--
-- Set up: two organisations, A and B, with one member each; call them user A
-- and user B, and note one award id from each.
--
--   -- impersonate user B. `set local` only applies inside a transaction, and
--   -- rolling back means the write tests leave nothing behind.
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<USER_B_UUID>","role":"authenticated"}';
--     -- ... run the checks below ...
--   rollback;
--
-- 1.  Cross-organisation award read.
--       select * from public.awards where organization_id = '<ORG_A_ID>';
--     Expect: 0 rows.
--
-- 2.  Direct id guess. Knowing an award id must not help.
--       select * from public.awards where id = '<ORG_A_AWARD_ID>';
--     Expect: 0 rows.
--
-- 3.  Unauthenticated read of every table.
--       set local role anon;
--       set local request.jwt.claims = '';
--       select count(*) from public.awards;        -- expect 0
--       select count(*) from public.obligations;   -- expect 0
--       select count(*) from public.documents;     -- expect 0
--       select count(*) from public.profiles;      -- expect 0
--     Expect: 0 everywhere, and no "permission denied for function" errors.
--
-- 4.  Document id guess (the one that matters most — these are the bytes).
--       select * from public.documents where id = '<ORG_A_DOCUMENT_ID>';
--       select * from public.document_segments where document_id = '<ORG_A_DOCUMENT_ID>';
--     Expect: 0 rows from both. The second proves the EXISTS policy holds even
--     though document_segments has no organization_id.
--
-- 5.  Citation leak through the child table.
--       select * from public.obligation_citations
--       where obligation_id = '<ORG_A_OBLIGATION_ID>';
--     Expect: 0 rows.
--
-- 6.  Write into another organisation.
--       insert into public.awards (organization_id, name, source_type, created_by)
--       values ('<ORG_A_ID>', 'injected', 'text', '<USER_B_UUID>');
--     Expect: "new row violates row-level security policy".
--
-- 7.  Move a row you own into someone else's organisation (the WITH CHECK test).
--       update public.awards set organization_id = '<ORG_A_ID>'
--       where id = '<ORG_B_AWARD_ID>';
--     Expect: RLS violation, not a silent success.
--
-- 8.  Self-service upgrade.
--       update public.subscriptions set plan = 'team' where organization_id = '<ORG_B_ID>';
--     Expect: permission denied / 0 rows updated. Members cannot write billing.
--
-- 9.  Audit tampering.
--       delete from public.audit_events where organization_id = '<ORG_B_ID>';
--       update public.audit_events set metadata = '{}'::jsonb where organization_id = '<ORG_B_ID>';
--     Expect: permission denied for both.
--
-- 10. Stripe ledger.
--       select * from public.processed_stripe_events;
--       insert into public.processed_stripe_events (id) values ('evt_forged');
--     Expect: 0 rows, then permission denied.
--
-- 11. Another user's profile.
--       select * from public.profiles where id = '<USER_A_UUID>';
--       update public.profiles set full_name = 'x' where id = '<USER_A_UUID>';
--     Expect: 0 rows, then 0 rows updated.
--
-- 12. Membership escalation. THIS IS THE ONE THAT ALREADY FOUND A REAL HOLE.
--       insert into public.organization_members (organization_id, user_id, role)
--       values ('<ORG_A_ID>', '<USER_B_UUID>', 'owner');
--     Expect: RLS violation. Also try promoting yourself inside your own
--     organisation while holding role 'member' — expect 0 rows updated.
--
-- 13. Organisation creation cannot be aimed at anyone else.
--       insert into public.organizations (name, slug, created_by)
--       values ('x', 'x', '<USER_A_UUID>');
--     Expect: permission denied (authenticated has no insert on the table).
--       select public.create_organization('My Org');
--     Expect: success, and the caller is the owner — never anybody else.
--
-- 14. Coverage check: no table in public escapes RLS. See supabase/README.md
--     for the pg_tables / pg_policies queries; both must come back empty
--     (processed_stripe_events is the one intentional entry in the second).
-- =============================================================================
