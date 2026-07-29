-- =============================================================================
-- AwardLens — private document storage
-- =============================================================================
--
-- Award documents are grant agreements. They contain budgets, staff names and
-- terms an organisation would not publish. The bucket is private, the objects
-- are never served statically, and access is decided by the same membership
-- predicate as every table in 0002.
--
-- Path convention (the application must not deviate from it, because the
-- policies below parse it):
--
--   organizations/{organizationId}/awards/{awardId}/{documentId}/{filename}
--         ^ 1              ^ 2         ^ 3     ^ 4       ^ 5         ^ 6
--
-- Organisation id is always segment 2. Nothing else in the path is trusted.
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The bucket
--
-- 15 MB matches MAX_UPLOAD_BYTES in src/lib/documents/validation.ts. The mime
-- list matches ACCEPTED_MIME_TYPES. Both are enforced again in application code;
-- this is the copy an attacker cannot skip by calling the storage API directly.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'award-documents',
  'award-documents',
  false,
  15728640, -- 15 * 1024 * 1024
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update
set public            = excluded.public,
    file_size_limit   = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Path parsing
--
-- split_part never errors, but `::uuid` does, and an error inside a policy is a
-- 500 on an ordinary listing rather than a clean denial. Worse, a permissive
-- policy paired with a throwing cast is easy to misread as "safe". So the cast
-- is guarded by a shape check and anything that does not match the convention
-- resolves to null — and is_org_member(null) is false, so a malformed path is
-- simply denied.
-- -----------------------------------------------------------------------------

create or replace function public.storage_object_org_id(object_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when object_name is null then null
    when split_part(object_name, '/', 1) <> 'organizations' then null
    when split_part(object_name, '/', 2) !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then null
    else split_part(object_name, '/', 2)::uuid
  end;
$$;

comment on function public.storage_object_org_id(text) is
  'Extracts the organisation id from an award-documents object path, or null if the path does not match organizations/{uuid}/... Never throws, so a malformed or hostile name is denied rather than erroring.';

revoke all on function public.storage_object_org_id(text) from public;
grant execute on function public.storage_object_org_id(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Object policies
--
-- storage.objects already has RLS enabled by Supabase; these add the AwardLens
-- rules on top. Every policy is scoped to this one bucket so other buckets keep
-- whatever rules they were given.
--
-- No update policy: documents are immutable once written. A corrected file is a
-- new document row and a new object. That keeps a citation's source bytes from
-- changing under it after review.
--
-- The service role bypasses these policies. Signed URLs issued server side are
-- how a browser ever reads bytes; the bucket itself stays private.
-- -----------------------------------------------------------------------------

drop policy if exists "award documents are readable by organisation members" on storage.objects;
create policy "award documents are readable by organisation members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'award-documents'
    and public.is_org_member(public.storage_object_org_id(name))
  );

drop policy if exists "award documents are writable by organisation members" on storage.objects;
create policy "award documents are writable by organisation members" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'award-documents'
    and public.is_org_member(public.storage_object_org_id(name))
  );

drop policy if exists "award documents are deletable by organisation members" on storage.objects;
create policy "award documents are deletable by organisation members" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'award-documents'
    and public.is_org_member(public.storage_object_org_id(name))
  );

-- =============================================================================
-- NEGATIVE TESTS for storage
-- =============================================================================
--
-- As user B (see the impersonation block in 0002):
--
--   -- another organisation's object, by exact path
--   select name from storage.objects
--   where bucket_id = 'award-documents'
--     and name like 'organizations/<ORG_A_ID>/%';
--   -- expect 0 rows
--
--   -- writing into another organisation's prefix
--   insert into storage.objects (bucket_id, name, owner)
--   values ('award-documents', 'organizations/<ORG_A_ID>/awards/x/y/z.pdf', auth.uid());
--   -- expect: new row violates row-level security policy
--
--   -- malformed paths must be denied, not error
--   insert into storage.objects (bucket_id, name, owner)
--   values ('award-documents', 'not-a-path', auth.uid());
--   insert into storage.objects (bucket_id, name, owner)
--   values ('award-documents', 'organizations/../awards/x/y/z.pdf', auth.uid());
--   -- expect: RLS violation in both cases, never "invalid input syntax for type uuid"
--
-- From a browser with an anon key: fetching the object's public URL must 400
-- with "Bucket not found"/"Object not found" rather than returning bytes,
-- because the bucket is private.
-- =============================================================================
