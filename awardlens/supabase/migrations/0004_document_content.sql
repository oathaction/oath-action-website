-- 0004_document_content.sql
--
-- Optional inline storage for document bytes.
--
-- The intended production shape is object storage: bytes live in the private
-- `award-documents` bucket (0003_storage.sql) and `documents.storage_path`
-- points at them. That remains the right answer at scale — Postgres is not an
-- object store, and large bytea values bloat backups and WAL.
--
-- But a Postgres-only deployment is a legitimate configuration: a single
-- managed database with no object store attached, which is how most small
-- self-hosted installs start. Uploads are capped at 15 MB by the application
-- (MAX_UPLOAD_BYTES), so inline storage is bounded and TOAST handles it
-- perfectly well at that size.
--
-- Exactly one of the two is populated for any document. The adapter writes
-- `content` when no object store is configured and `storage_path` when one is,
-- and reads whichever is present.

alter table public.documents
  add column if not exists content bytea;

comment on column public.documents.content is
  'Raw document bytes, used only when no object store is configured. Mutually exclusive with storage_path. Capped by the application at 15 MB.';

-- Keep the two storage strategies mutually exclusive so a document can never
-- have two divergent sources of truth for its own bytes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_single_byte_source'
  ) then
    alter table public.documents
      add constraint documents_single_byte_source
      check (content is null or storage_path is null);
  end if;
end $$;

-- Retrieving a document's metadata must not drag its bytes along. Callers that
-- want the bytes select `content` explicitly.
comment on table public.documents is
  'Uploaded award documents. Never select content unless you need the bytes.';
