-- =============================================================================
-- AwardLens — demo seed
-- =============================================================================
--
-- A single small organisation with one award, so a fresh local project has
-- something to look at. Everything here is invented: the funder, the award
-- number, the people and the document text. Nothing is real award data.
--
-- Applied automatically by `supabase db reset`. It is guarded: if any
-- organisation already exists the whole script does nothing, so running it
-- against a database with real data in it is a no-op rather than a mess. It is
-- still a seed — do not run it against production.
--
-- Demo accounts (local only):
--   dana.owner@awardlens.test    — owner
--   sam.member@awardlens.test    — member
-- No passwords are set. Sign in with the email code / magic link flow and read
-- the message from the local mail catcher at http://localhost:54324.
-- =============================================================================

do $seed$
declare
  org_id       constant uuid := '00000000-1111-4000-8000-000000000001';
  owner_id     constant uuid := '00000000-2222-4000-8000-000000000001';
  member_id    constant uuid := '00000000-2222-4000-8000-000000000002';
  award_id     constant uuid := '00000000-3333-4000-8000-000000000001';
  document_id  constant uuid := '00000000-4444-4000-8000-000000000001';
  segment_1    constant uuid := '00000000-5555-4000-8000-000000000001';
  segment_2    constant uuid := '00000000-5555-4000-8000-000000000002';
  segment_3    constant uuid := '00000000-5555-4000-8000-000000000003';
  run_id       constant uuid := '00000000-6666-4000-8000-000000000001';
  obligation_1 constant uuid := '00000000-7777-4000-8000-000000000001';
  obligation_2 constant uuid := '00000000-7777-4000-8000-000000000002';
  obligation_3 constant uuid := '00000000-7777-4000-8000-000000000003';
begin
  if exists (select 1 from public.organizations limit 1) then
    raise notice 'AwardLens seed: organisations already exist, skipping.';
    return;
  end if;

  -- ---------------------------------------------------------------- auth ----
  -- Profiles are keyed by auth.users, so the demo users have to exist first.
  -- If this fails (a Supabase version with a different auth schema, or a
  -- database with no auth schema at all) the seed stops cleanly.
  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values
      ('00000000-0000-0000-0000-000000000000', owner_id, 'authenticated', 'authenticated',
       'dana.owner@awardlens.test', '', now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Dana Okafor"}'::jsonb),
      ('00000000-0000-0000-0000-000000000000', member_id, 'authenticated', 'authenticated',
       'sam.member@awardlens.test', '', now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Sam Ndiaye"}'::jsonb)
    on conflict (id) do nothing;
  exception when others then
    raise notice 'AwardLens seed: could not create demo auth users (%). Nothing was seeded.', sqlerrm;
    return;
  end;

  -- Identities let the email provider recognise these users. Non-fatal: the
  -- rest of the demo data is still useful for reading the schema without them.
  begin
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values
      (gen_random_uuid(), owner_id::text, owner_id,
       jsonb_build_object('sub', owner_id::text, 'email', 'dana.owner@awardlens.test', 'email_verified', true),
       'email', now(), now(), now()),
      (gen_random_uuid(), member_id::text, member_id,
       jsonb_build_object('sub', member_id::text, 'email', 'sam.member@awardlens.test', 'email_verified', true),
       'email', now(), now(), now())
    on conflict do nothing;
  exception when others then
    raise notice 'AwardLens seed: skipped auth.identities (%).', sqlerrm;
  end;

  -- ------------------------------------------------------------ profiles ----
  insert into public.profiles (id, email, full_name)
  values
    (owner_id, 'dana.owner@awardlens.test', 'Dana Okafor'),
    (member_id, 'sam.member@awardlens.test', 'Sam Ndiaye')
  on conflict (id) do nothing;

  -- -------------------------------------------------------- organisation ----
  insert into public.organizations (id, name, slug, created_by)
  values (org_id, 'Riverside Community Trust (demo)', 'riverside-community-trust-demo', owner_id);

  insert into public.organization_members (organization_id, user_id, role)
  values
    (org_id, owner_id, 'owner'),
    (org_id, member_id, 'member');

  insert into public.subscriptions (organization_id, plan, status, award_credits)
  values (org_id, 'demo', 'active', 0);

  insert into public.notification_preferences (user_id, organization_id, enabled, offsets)
  values
    (owner_id, org_id, true, '[30, 14, 7, 1]'::jsonb),
    (member_id, org_id, true, '[14, 1]'::jsonb);

  -- --------------------------------------------------------------- award ----
  insert into public.awards (
    id, organization_id, name, funder, recipient_name, award_number,
    award_amount, currency, start_date, end_date, effective_date,
    grant_period_text, program_name, assistance_type,
    primary_contacts, governing_documents,
    status, review_status, source_type, created_by
  )
  values (
    award_id, org_id,
    'Youth Literacy Partnership 2026',
    'Example State Department of Education (demo funder)',
    'Riverside Community Trust',
    'DEMO-2026-0114',
    185000.00, 'USD',
    date_trunc('year', current_date)::date,
    (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
    date_trunc('year', current_date)::date,
    'Twelve month period of performance, renewable once.',
    'Youth Literacy Partnership',
    'Grant',
    '[{"name":"Alex Prieto","role":"Program Officer","organization":"Example State Department of Education","email":"program.officer@funder.demo","phone":null}]'::jsonb,
    '["Notice of Award","General Terms and Conditions (rev. 2025)","2 CFR Part 200"]'::jsonb,
    'active', 'in_progress', 'sample', owner_id
  );

  -- ------------------------------------------------------------ document ----
  insert into public.documents (
    id, award_id, organization_id, storage_path, original_filename, mime_type,
    byte_size, content_hash, parser_status, parser_message, page_count,
    extracted_text_version
  )
  values (
    document_id, award_id, org_id,
    null, -- no bytes are seeded; storage stays empty on a fresh project
    'youth-literacy-partnership-2026-notice-of-award.pdf',
    'application/pdf',
    248320,
    repeat('a1b2c3d4', 8), -- 64 hex characters, the shape of a SHA-256 digest
    'parsed', null, 14, '1'
  );

  insert into public.document_segments (id, document_id, locator_type, locator_value, heading, "text", sequence, token_estimate)
  values
    (segment_1, document_id, 'section', 'Article IV.2', 'Reporting Requirements',
     'The Recipient shall submit a quarterly programmatic report within thirty (30) days of the close of each calendar quarter, using the form provided by the Department.',
     0, 42),
    (segment_2, document_id, 'section', 'Article V.1', 'Financial Management',
     'The Recipient shall submit a final financial report no later than ninety (90) days after the end of the period of performance. Unobligated balances shall be returned with the final report.',
     1, 46),
    (segment_3, document_id, 'section', 'Article VII.3', 'Prior Approval',
     'Written approval from the Department is required before transferring more than ten percent (10%) of the total approved budget between cost categories.',
     2, 38);

  -- ------------------------------------------------------- processing run ---
  insert into public.processing_runs (
    id, award_id, document_id, organization_id, status, stage,
    model, prompt_version, started_at, completed_at, usage_metadata
  )
  values (
    run_id, award_id, document_id, org_id, 'succeeded', 'preparing_review',
    'demo-fixture', 'seed',
    now() - interval '10 minutes', now() - interval '8 minutes',
    '{"inputTokens":0,"outputTokens":0,"totalTokens":0,"calls":0,"stages":{}}'::jsonb
  );

  -- --------------------------------------------------------- obligations ----
  insert into public.obligations (
    id, award_id, organization_id, category, title, description,
    original_date_text, due_date, recurrence, internal_due_date,
    suggested_owner_role, assigned_user_id, priority, confidence,
    review_status, interpretation_level, consequence, clarification_question,
    source_status, notes, date_conflicts, origin
  )
  values
    (obligation_1, award_id, org_id, 'reporting',
     'Quarterly programmatic report',
     'Submit a programmatic report on the funder''s form within 30 days of the end of each calendar quarter.',
     'within thirty (30) days of the close of each calendar quarter',
     (date_trunc('quarter', current_date) + interval '3 months 30 days')::date,
     'quarterly',
     (date_trunc('quarter', current_date) + interval '3 months 16 days')::date,
     'Program Manager', member_id, 'high', 0.94,
     'confirmed', 'explicit',
     'Late reports may delay reimbursement.', null,
     'verified', null, '[]'::jsonb, 'extracted'),

    (obligation_2, award_id, org_id, 'financial',
     'Final financial report and return of unobligated funds',
     'Submit the final financial report within 90 days of the end of the period of performance and return any unobligated balance.',
     'no later than ninety (90) days after the end of the period of performance',
     ((date_trunc('year', current_date) + interval '1 year - 1 day') + interval '90 days')::date,
     null,
     ((date_trunc('year', current_date) + interval '1 year - 1 day') + interval '60 days')::date,
     'Finance Lead', owner_id, 'critical', 0.91,
     'needs_review', 'explicit',
     'Unreturned balances are recoverable by the funder.', null,
     'verified', null, '[]'::jsonb, 'extracted'),

    (obligation_3, award_id, org_id, 'prior_approval',
     'Prior approval for budget transfers above 10%',
     'Obtain written funder approval before moving more than 10% of the total approved budget between cost categories.',
     null, null, null, null,
     'Finance Lead', null, 'medium', 0.78,
     'needs_clarification', 'light_interpretation',
     'Unapproved transfers may be disallowed at audit.',
     'Does the 10% threshold apply per cost category or to the budget as a whole?',
     'partial', 'Raised with the programme officer on the kickoff call.',
     '[]'::jsonb, 'extracted');

  insert into public.obligation_citations (
    obligation_id, document_segment_id, locator_type, locator_value, excerpt,
    start_offset, end_offset, match_score
  )
  values
    (obligation_1, segment_1, 'section', 'Article IV.2',
     'submit a quarterly programmatic report within thirty (30) days of the close of each calendar quarter',
     26, 128, 0.98),
    (obligation_2, segment_2, 'section', 'Article V.1',
     'submit a final financial report no later than ninety (90) days after the end of the period of performance',
     26, 132, 0.97),
    (obligation_3, segment_3, 'section', 'Article VII.3',
     'Written approval from the Department is required before transferring more than ten percent (10%) of the total approved budget',
     0, 124, 0.86);

  -- ----------------------------------------------------------- reminders ----
  insert into public.reminders (
    obligation_id, organization_id, user_id, offset_days, scheduled_for,
    status, idempotency_key
  )
  values
    (obligation_1, org_id, member_id, 14,
     ((date_trunc('quarter', current_date) + interval '3 months 30 days') - interval '14 days'),
     'scheduled', 'seed:' || obligation_1::text || ':14'),
    (obligation_2, org_id, owner_id, 30,
     (((date_trunc('year', current_date) + interval '1 year - 1 day') + interval '90 days') - interval '30 days'),
     'scheduled', 'seed:' || obligation_2::text || ':30');

  -- --------------------------------------------------------------- ask -----
  insert into public.ask_exchanges (
    award_id, organization_id, user_id, question, answer, answer_type,
    interpretation_level, citations, suggested_funder_question
  )
  values (
    award_id, org_id, owner_id,
    'Can we spend award funds on food for participant sessions?',
    'This award''s documents do not address food or refreshment costs. Nothing here permits or prohibits them, so treat it as an open question rather than an allowance.',
    'not_addressed', 'explicit',
    '[]'::jsonb,
    'Are participant refreshment costs allowable under this award, and if so up to what amount per session?'
  );

  -- ------------------------------------------------------------- exports ----
  insert into public.exports (award_id, organization_id, format, storage_path, generated_by)
  values (award_id, org_id, 'csv', null, owner_id);

  -- -------------------------------------------------------- audit events ----
  insert into public.audit_events (organization_id, user_id, event_type, entity_type, entity_id, metadata)
  values
    (org_id, owner_id, 'award.created', 'award', award_id::text,
     jsonb_build_object('source', 'seed')),
    (org_id, owner_id, 'obligation.confirmed', 'obligation', obligation_1::text,
     jsonb_build_object('source', 'seed', 'reviewStatus', 'confirmed')),
    (org_id, member_id, 'export.generated', 'award', award_id::text,
     jsonb_build_object('source', 'seed', 'format', 'csv'));

  raise notice 'AwardLens seed: 1 organisation, 2 users, 1 award, 3 obligations.';
end
$seed$;
