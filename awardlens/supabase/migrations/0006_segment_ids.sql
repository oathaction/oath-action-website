-- =============================================================================
-- AwardLens — document segment ids are derived keys, not uuids
-- =============================================================================
--
-- `createSegments(documentId, segments)` mints ids of the form
-- `<documentId>:<sequence>` (see src/lib/db/local.ts). That form is not
-- decoration:
--
--   * the extraction prompt hands the model those ids and asks it to cite with
--     them (src/lib/ai/prompts.ts), and src/lib/ai/citations.ts resolves a
--     model's citation back to a stored segment by id;
--   * src/lib/awards/process.ts writes the resolved id straight into
--     obligation_citations.document_segment_id, whose foreign key targets this
--     column.
--
-- So whatever createSegments returns has to be storable here. A uuid column
-- cannot hold `<uuid>:<int>`, which leaves two options: mint uuids and diverge
-- from the reference implementation's ids, or widen the column. Widening wins:
-- the derived key is deterministic, so re-segmenting a document produces the
-- same ids and citations recorded against an earlier parse still resolve, and
-- the (document_id, sequence) unique index already makes the derived key
-- exactly as unique as a generated one. Nothing anywhere parses a segment id,
-- so widening the type costs nothing else.
--
-- Only obligation_citations references document_segments.id, so that one
-- foreign key moves with it.
--
-- Safe to re-run: the conversion is guarded on the column still being uuid.
-- =============================================================================

do $$
begin
  if (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'document_segments'
      and column_name = 'id'
  ) = 'uuid' then

    -- The referencing column has to be converted too, so the key is dropped
    -- and rebuilt around it rather than converted underneath it.
    alter table public.obligation_citations
      drop constraint if exists obligation_citations_document_segment_id_fkey;

    alter table public.document_segments alter column id drop default;
    alter table public.document_segments alter column id type text using id::text;
    -- Kept so a writer that does not supply an id (the seed, a manual insert)
    -- still gets a unique one. The application always supplies its own.
    alter table public.document_segments alter column id set default gen_random_uuid()::text;

    alter table public.obligation_citations
      alter column document_segment_id type text using document_segment_id::text;

    alter table public.obligation_citations
      add constraint obligation_citations_document_segment_id_fkey
      foreign key (document_segment_id) references public.document_segments (id)
      on delete set null;

  end if;
end
$$;

comment on column public.document_segments.id is
  'Text, not uuid: the application derives it as <document_id>:<sequence> so citations survive re-segmentation of the same document. See src/lib/db/local.ts createSegments.';

comment on column public.obligation_citations.document_segment_id is
  'Nullable and set null on delete: a citation whose segment is gone is still evidence of what the model quoted. Text to match document_segments.id.';
