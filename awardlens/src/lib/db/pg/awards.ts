import "server-only";

import type postgres from "postgres";

import type {
  Award,
  AwardContact,
  AwardReviewStatus,
  AwardSourceType,
  AwardStatus,
  DocumentRecord,
  DocumentSegment,
  LocatorType,
  ParserStatus,
  ProcessingRun,
  ProcessingStage,
  ProcessingStatus,
  UsageMetadata,
} from "@/lib/domain/types";

import { getSql, toDateOrNull, toIso, toIsoOrNull, toNumber, toNumberOrNull } from "./client";

/**
 * Postgres adapter: awards, documents, segments and processing runs.
 *
 * Behaviour is the contract defined by `src/lib/db/local.ts`; this module is a
 * different storage engine for the same observable semantics, not a different
 * API. Two rules carry that contract into SQL:
 *
 *   1. Every statement that takes an `organizationId` carries
 *      `and organization_id = $n` in its WHERE clause. Scoping is enforced
 *      here, never assumed of the caller, so a wrong organisation gets
 *      null/false/[] rather than someone else's grant agreement.
 *
 *   2. Updates never assign `id`, `organization_id` or `award_id`. The file
 *      store re-pins those after `Object.assign`; the equivalent here is that
 *      they are simply not in any whitelist, so no patch can move a row between
 *      organisations or awards.
 *
 * Column names are the snake_case form of the domain fields and are mapped
 * explicitly below — `numeric` arrives as a string, `timestamptz` as a Date,
 * and `date` as `YYYY-MM-DD` (see the type override in ./client).
 */

/* ------------------------------------------------------------- helpers -- */

/**
 * jsonb payloads are sent as text and coerced by the target column's type.
 * `sql.json` would be the idiomatic call, but the domain's interfaces
 * (AwardContact, UsageMetadata) do not structurally satisfy the driver's
 * index-signature JSONValue type, so this keeps every jsonb write on one path
 * without widening types at each call site.
 */
function jsonb(value: unknown): string {
  return JSON.stringify(value);
}

/** As `jsonb`, but a JS null becomes SQL NULL rather than the JSON value `null`. */
function jsonbOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/**
 * A value in a whitelisted UPDATE ... SET assignment. Fragments are permitted
 * so a column can be assigned a guarded expression (see `updateDocument`); the
 * caller's data is still interpolated as a parameter inside that fragment.
 */
type ColumnValue = string | number | boolean | null | postgres.Fragment;
type ColumnPatch = Record<string, ColumnValue>;

/* -------------------------------------------------------------- awards -- */

interface AwardRow {
  id: string;
  organization_id: string;
  name: string;
  funder: string | null;
  recipient_name: string | null;
  award_number: string | null;
  award_amount: string | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  effective_date: string | null;
  grant_period_text: string | null;
  program_name: string | null;
  assistance_type: string | null;
  primary_contacts: AwardContact[] | null;
  governing_documents: string[] | null;
  status: AwardStatus;
  review_status: AwardReviewStatus;
  source_type: AwardSourceType;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapAward(row: AwardRow): Award {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    funder: row.funder,
    recipientName: row.recipient_name,
    awardNumber: row.award_number,
    awardAmount: toNumberOrNull(row.award_amount),
    currency: row.currency,
    startDate: toDateOrNull(row.start_date),
    endDate: toDateOrNull(row.end_date),
    effectiveDate: toDateOrNull(row.effective_date),
    grantPeriodText: row.grant_period_text,
    programName: row.program_name,
    assistanceType: row.assistance_type,
    // Non-nullable in the domain: a null column is an empty collection.
    primaryContacts: row.primary_contacts ?? [],
    governingDocuments: row.governing_documents ?? [],
    status: row.status,
    reviewStatus: row.review_status,
    sourceType: row.source_type,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createAward(
  input: Omit<Award, "id" | "createdAt" | "updatedAt">,
): Promise<Award> {
  const sql = getSql();
  const [row] = await sql<AwardRow[]>`
    insert into public.awards (
      organization_id, name, funder, recipient_name, award_number, award_amount,
      currency, start_date, end_date, effective_date, grant_period_text,
      program_name, assistance_type, primary_contacts, governing_documents,
      status, review_status, source_type, created_by
    ) values (
      ${input.organizationId}, ${input.name}, ${input.funder}, ${input.recipientName},
      ${input.awardNumber}, ${input.awardAmount}, ${input.currency}, ${input.startDate},
      ${input.endDate}, ${input.effectiveDate}, ${input.grantPeriodText}, ${input.programName},
      ${input.assistanceType}, ${jsonb(input.primaryContacts)}, ${jsonb(input.governingDocuments)},
      ${input.status}, ${input.reviewStatus}, ${input.sourceType}, ${input.createdBy}
    )
    returning *
  `;
  return mapAward(row);
}

export async function getAward(id: string, organizationId: string): Promise<Award | null> {
  const sql = getSql();
  const [row] = await sql<AwardRow[]>`
    select * from public.awards
    where id = ${id} and organization_id = ${organizationId}
  `;
  return row ? mapAward(row) : null;
}

export async function listAwards(organizationId: string): Promise<Award[]> {
  const sql = getSql();
  const rows = await sql<AwardRow[]>`
    select * from public.awards
    where organization_id = ${organizationId}
    -- id only breaks ties; created_at has microsecond resolution so it decides
    -- in practice, and the order then matches the file store's stable sort.
    order by created_at desc, id desc
  `;
  return rows.map(mapAward);
}

export async function updateAward(
  id: string,
  organizationId: string,
  patch: Partial<Award>,
): Promise<Award | null> {
  const sql = getSql();

  // The whitelist IS the immutability guarantee: id, organization_id,
  // created_at and updated_at are absent, so no patch can reach them. The
  // set_updated_at trigger maintains updated_at, matching the file store's
  // unconditional `updatedAt: now()`.
  const updates: ColumnPatch = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.funder !== undefined) updates.funder = patch.funder;
  if (patch.recipientName !== undefined) updates.recipient_name = patch.recipientName;
  if (patch.awardNumber !== undefined) updates.award_number = patch.awardNumber;
  if (patch.awardAmount !== undefined) updates.award_amount = patch.awardAmount;
  if (patch.currency !== undefined) updates.currency = patch.currency;
  if (patch.startDate !== undefined) updates.start_date = patch.startDate;
  if (patch.endDate !== undefined) updates.end_date = patch.endDate;
  if (patch.effectiveDate !== undefined) updates.effective_date = patch.effectiveDate;
  if (patch.grantPeriodText !== undefined) updates.grant_period_text = patch.grantPeriodText;
  if (patch.programName !== undefined) updates.program_name = patch.programName;
  if (patch.assistanceType !== undefined) updates.assistance_type = patch.assistanceType;
  if (patch.primaryContacts !== undefined) updates.primary_contacts = jsonb(patch.primaryContacts);
  if (patch.governingDocuments !== undefined) {
    updates.governing_documents = jsonb(patch.governingDocuments);
  }
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.reviewStatus !== undefined) updates.review_status = patch.reviewStatus;
  if (patch.sourceType !== undefined) updates.source_type = patch.sourceType;
  if (patch.createdBy !== undefined) updates.created_by = patch.createdBy;

  // An empty patch still bumps updated_at and returns the row, as the file
  // store does; `set` cannot be empty, so the timestamp is written directly.
  const [row] = Object.keys(updates).length
    ? await sql<AwardRow[]>`
        update public.awards set ${sql(updates)}
        where id = ${id} and organization_id = ${organizationId}
        returning *
      `
    : await sql<AwardRow[]>`
        update public.awards set updated_at = now()
        where id = ${id} and organization_id = ${organizationId}
        returning *
      `;

  return row ? mapAward(row) : null;
}

/**
 * Deleting an award deletes everything hanging off it.
 *
 * The file store removes the children by hand; here the schema does it. Every
 * ownership edge below the award is `on delete cascade` in 0001 —
 * documents -> document_segments, obligations -> obligation_citations and
 * -> reminders, plus processing_runs, ask_exchanges and exports — so a single
 * delete leaves nothing behind, including the document bytes, which live in
 * documents.content.
 */
export async function deleteAward(id: string, organizationId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    delete from public.awards
    where id = ${id} and organization_id = ${organizationId}
    returning id
  `;
  return rows.length > 0;
}

export async function findAwardByContentHash(
  organizationId: string,
  contentHash: string,
): Promise<{ award: Award; document: DocumentRecord } | null> {
  const sql = getSql();
  // (organization_id, content_hash) is unique, so this is at most one row.
  const [documentRow] = await sql<DocumentRow[]>`
    select ${sql(DOCUMENT_COLUMNS)} from public.documents
    where organization_id = ${organizationId} and content_hash = ${contentHash}
  `;
  if (!documentRow) return null;

  const award = await getAward(documentRow.award_id, organizationId);
  if (!award) return null;

  return { award, document: mapDocument(documentRow) };
}

/* ----------------------------------------------------------- documents -- */

/**
 * Every documents query names its columns because `content` holds the file
 * bytes: `select *` would drag a 15 MB payload through every metadata read.
 */
const DOCUMENT_COLUMNS = [
  "id",
  "award_id",
  "organization_id",
  "storage_path",
  "original_filename",
  "mime_type",
  "byte_size",
  "content_hash",
  "parser_status",
  "parser_message",
  "page_count",
  "extracted_text_version",
  "created_at",
];

interface DocumentRow {
  id: string;
  award_id: string;
  organization_id: string;
  storage_path: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: string | number;
  content_hash: string;
  parser_status: ParserStatus;
  parser_message: string | null;
  page_count: number | null;
  extracted_text_version: string;
  created_at: Date | string;
}

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    awardId: row.award_id,
    organizationId: row.organization_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    // bigint arrives as a string so precision is never silently lost.
    byteSize: toNumber(row.byte_size),
    contentHash: row.content_hash,
    parserStatus: row.parser_status,
    parserMessage: row.parser_message,
    pageCount: toNumberOrNull(row.page_count),
    extractedTextVersion: row.extracted_text_version,
    createdAt: toIso(row.created_at),
  };
}

export async function createDocument(
  input: Omit<DocumentRecord, "id" | "createdAt">,
): Promise<DocumentRecord> {
  const sql = getSql();
  const [row] = await sql<DocumentRow[]>`
    insert into public.documents (
      award_id, organization_id, storage_path, original_filename, mime_type,
      byte_size, content_hash, parser_status, parser_message, page_count,
      extracted_text_version
    ) values (
      ${input.awardId}, ${input.organizationId}, ${input.storagePath},
      ${input.originalFilename}, ${input.mimeType}, ${input.byteSize},
      ${input.contentHash}, ${input.parserStatus}, ${input.parserMessage},
      ${input.pageCount}, ${input.extractedTextVersion}
    )
    returning ${sql(DOCUMENT_COLUMNS)}
  `;
  return mapDocument(row);
}

export async function updateDocument(
  id: string,
  organizationId: string,
  patch: Partial<DocumentRecord>,
): Promise<DocumentRecord | null> {
  const sql = getSql();

  const updates: ColumnPatch = {};
  if (patch.storagePath !== undefined) {
    // `documents_single_byte_source` (0004) forbids a row from having both
    // inline bytes and a storage path. This adapter's saveDocumentBytes stores
    // bytes inline, and its caller then writes the returned locator back
    // through this function, so the assignment is guarded: a storage path is
    // recorded only for a document whose bytes are NOT inline. The alternative
    // — letting the write through — would either violate the constraint or
    // leave two disagreeing sources of truth for the same document's bytes.
    updates.storage_path = sql`case when content is null then ${patch.storagePath} else null end`;
  }
  if (patch.originalFilename !== undefined) updates.original_filename = patch.originalFilename;
  if (patch.mimeType !== undefined) updates.mime_type = patch.mimeType;
  if (patch.byteSize !== undefined) updates.byte_size = patch.byteSize;
  if (patch.contentHash !== undefined) updates.content_hash = patch.contentHash;
  if (patch.parserStatus !== undefined) updates.parser_status = patch.parserStatus;
  if (patch.parserMessage !== undefined) updates.parser_message = patch.parserMessage;
  if (patch.pageCount !== undefined) updates.page_count = patch.pageCount;
  if (patch.extractedTextVersion !== undefined) {
    updates.extracted_text_version = patch.extractedTextVersion;
  }

  // documents has no updated_at, so an empty patch is a plain read — the same
  // "returns the unchanged record" behaviour as the file store.
  if (Object.keys(updates).length === 0) return getDocument(id, organizationId);

  const [row] = await sql<DocumentRow[]>`
    update public.documents set ${sql(updates)}
    where id = ${id} and organization_id = ${organizationId}
    returning ${sql(DOCUMENT_COLUMNS)}
  `;
  return row ? mapDocument(row) : null;
}

export async function getDocument(
  id: string,
  organizationId: string,
): Promise<DocumentRecord | null> {
  const sql = getSql();
  const [row] = await sql<DocumentRow[]>`
    select ${sql(DOCUMENT_COLUMNS)} from public.documents
    where id = ${id} and organization_id = ${organizationId}
  `;
  return row ? mapDocument(row) : null;
}

export async function listDocuments(
  awardId: string,
  organizationId: string,
): Promise<DocumentRecord[]> {
  const sql = getSql();
  const rows = await sql<DocumentRow[]>`
    select ${sql(DOCUMENT_COLUMNS)} from public.documents
    where award_id = ${awardId} and organization_id = ${organizationId}
    -- The file store returns insertion order and callers treat the first row as
    -- the award's primary document, so the oldest must come first.
    order by created_at, id
  `;
  return rows.map(mapDocument);
}

export async function deleteDocument(id: string, organizationId: string): Promise<boolean> {
  const sql = getSql();
  // document_segments cascade from documents (0001), and the bytes go with the
  // row because they are a column of it.
  const rows = await sql`
    delete from public.documents
    where id = ${id} and organization_id = ${organizationId}
    returning id
  `;
  return rows.length > 0;
}

/**
 * Stores document bytes in the database.
 *
 * This is the Postgres-only configuration described in 0004: with no object
 * store attached the bytes live in `documents.content`, capped by the
 * application at 15 MB. `storage_path` is cleared in the same statement
 * because the two are mutually exclusive by check constraint.
 *
 * The returned locator is the value the file store's caller records as the
 * document's `storagePath`; see `updateDocument` for why it is not persisted
 * there when the bytes are inline.
 */
export async function saveDocumentBytes(documentId: string, data: Buffer): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    update public.documents
    set content = ${data}, storage_path = null
    where id = ${documentId}
    returning id
  `;
  if (rows.length === 0) {
    // The file store would write an orphan file here. Reporting success while
    // discarding a user's uploaded document is the worse failure, so this
    // throws instead: the caller always creates the document row first.
    throw new Error(`Cannot store bytes for unknown document ${documentId}.`);
  }
  return `postgres://documents/${documentId}`;
}

export async function readDocumentBytes(documentId: string): Promise<Buffer | null> {
  const sql = getSql();
  // Unscoped, exactly as in the file store: callers resolve the document
  // through getDocument (which is scoped) before asking for its bytes.
  const [row] = await sql<{ content: Buffer | null }[]>`
    select content from public.documents where id = ${documentId}
  `;
  if (!row || row.content === null) return null;
  return Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
}

/* ------------------------------------------------------------ segments -- */

interface SegmentRow {
  id: string;
  document_id: string;
  locator_type: LocatorType;
  locator_value: string;
  heading: string | null;
  text: string;
  sequence: number;
  token_estimate: number;
  created_at: Date | string;
}

function mapSegment(row: SegmentRow): DocumentSegment {
  return {
    id: row.id,
    documentId: row.document_id,
    locatorType: row.locator_type,
    locatorValue: row.locator_value,
    heading: row.heading,
    text: row.text,
    sequence: toNumber(row.sequence),
    tokenEstimate: toNumber(row.token_estimate),
    createdAt: toIso(row.created_at),
  };
}

/**
 * Ids are derived as `${documentId}:${sequence}`, exactly as the file store
 * mints them. Citations are written against these ids, so the form is part of
 * the contract rather than an implementation detail — migration 0006 widens
 * `document_segments.id` (and the citation foreign key) to text to hold it.
 */
export async function createSegments(
  documentId: string,
  segments: Omit<DocumentSegment, "id" | "documentId" | "createdAt">[],
): Promise<DocumentSegment[]> {
  if (segments.length === 0) return [];

  const sql = getSql();
  const rows = segments.map((segment) => ({
    id: `${documentId}:${segment.sequence}`,
    document_id: documentId,
    locator_type: segment.locatorType,
    locator_value: segment.locatorValue,
    heading: segment.heading,
    text: segment.text,
    sequence: segment.sequence,
    token_estimate: segment.tokenEstimate,
  }));

  const inserted = await sql<SegmentRow[]>`
    insert into public.document_segments ${sql(rows)}
    returning *
  `;

  // Returned in the caller's order rather than whatever order the insert
  // reports, so the result lines up with the input like the file store's does.
  const byId = new Map(inserted.map((row) => [row.id, row]));
  return rows.flatMap((row) => {
    const stored = byId.get(row.id);
    return stored ? [mapSegment(stored)] : [];
  });
}

export async function listSegments(documentId: string): Promise<DocumentSegment[]> {
  const sql = getSql();
  const rows = await sql<SegmentRow[]>`
    select * from public.document_segments
    where document_id = ${documentId}
    order by sequence asc
  `;
  return rows.map(mapSegment);
}

/* ------------------------------------------------------ processing runs -- */

interface RunRow {
  id: string;
  award_id: string;
  document_id: string;
  status: ProcessingStatus;
  stage: ProcessingStage;
  model: string | null;
  prompt_version: string;
  started_at: Date | string;
  completed_at: Date | string | null;
  error_code: string | null;
  error_message: string | null;
  usage_metadata: UsageMetadata | null;
  created_at: Date | string;
}

function mapRun(row: RunRow): ProcessingRun {
  return {
    id: row.id,
    awardId: row.award_id,
    documentId: row.document_id,
    status: row.status,
    stage: row.stage,
    model: row.model,
    promptVersion: row.prompt_version,
    startedAt: toIso(row.started_at),
    completedAt: toIsoOrNull(row.completed_at),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    usageMetadata: row.usage_metadata,
    createdAt: toIso(row.created_at),
  };
}

/**
 * processing_runs carries a denormalised organization_id that the domain type
 * does not, so it is read from the award instead of trusted from the caller —
 * a run can never be filed under an organisation that does not own its award.
 */
export async function createRun(
  input: Omit<ProcessingRun, "id" | "createdAt">,
): Promise<ProcessingRun> {
  const sql = getSql();
  const [row] = await sql<RunRow[]>`
    insert into public.processing_runs (
      award_id, document_id, organization_id, status, stage, model,
      prompt_version, started_at, completed_at, error_code, error_message,
      usage_metadata
    ) values (
      ${input.awardId}, ${input.documentId},
      (select organization_id from public.awards where id = ${input.awardId}),
      ${input.status}, ${input.stage}, ${input.model}, ${input.promptVersion},
      ${input.startedAt}, ${input.completedAt}, ${input.errorCode},
      ${input.errorMessage}, ${jsonbOrNull(input.usageMetadata)}
    )
    returning *
  `;
  return mapRun(row);
}

export async function updateRun(
  id: string,
  patch: Partial<ProcessingRun>,
): Promise<ProcessingRun | null> {
  const sql = getSql();

  // award_id and document_id are outside the whitelist: a run belongs to the
  // award it was started for, and moving it would also desynchronise the
  // denormalised organization_id.
  const updates: ColumnPatch = {};
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.stage !== undefined) updates.stage = patch.stage;
  if (patch.model !== undefined) updates.model = patch.model;
  if (patch.promptVersion !== undefined) updates.prompt_version = patch.promptVersion;
  if (patch.startedAt !== undefined) updates.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) updates.completed_at = patch.completedAt;
  if (patch.errorCode !== undefined) updates.error_code = patch.errorCode;
  if (patch.errorMessage !== undefined) updates.error_message = patch.errorMessage;
  if (patch.usageMetadata !== undefined) {
    updates.usage_metadata = jsonbOrNull(patch.usageMetadata);
  }

  if (Object.keys(updates).length === 0) {
    const [unchanged] = await sql<RunRow[]>`
      select * from public.processing_runs where id = ${id}
    `;
    return unchanged ? mapRun(unchanged) : null;
  }

  const [row] = await sql<RunRow[]>`
    update public.processing_runs set ${sql(updates)}
    where id = ${id}
    returning *
  `;
  return row ? mapRun(row) : null;
}

export async function getLatestRun(awardId: string): Promise<ProcessingRun | null> {
  const sql = getSql();
  const [row] = await sql<RunRow[]>`
    select * from public.processing_runs
    where award_id = ${awardId}
    order by started_at desc
    limit 1
  `;
  return row ? mapRun(row) : null;
}
