import "server-only";

import { randomUUID } from "node:crypto";

import type postgres from "postgres";

import type {
  DateConflict,
  InterpretationLevel,
  LocatorType,
  Obligation,
  ObligationCategory,
  ObligationCitation,
  ObligationPriority,
  ReviewStatus,
  SourceStatus,
} from "@/lib/domain/types";

import type { Sql } from "./client";
import { getSql, isUuid, toDateOrNull, toIso, toNumber, toNumberOrNull } from "./client";

/**
 * Postgres adapter: obligations and their citations.
 *
 * `src/lib/db/local.ts` is the contract. This module is a different storage
 * engine for the same observable behaviour, so three rules carry over:
 *
 *   1. Every statement that takes an `organizationId` carries
 *      `and organization_id = $n`. Scoping is enforced here, never assumed of
 *      the caller, so the wrong organisation gets null/false/[] rather than
 *      someone else's compliance register.
 *
 *   2. Updates never assign `id`, `organization_id` or `award_id`. The file
 *      store re-pins them after `Object.assign`; here they are simply absent
 *      from the whitelist, so no patch can move an obligation between
 *      organisations or awards.
 *
 *   3. Ids and creation timestamps are minted in JavaScript rather than left to
 *      the column defaults — see `batchStamps` for why the timestamps have to
 *      be, and `createObligations` for why the ids follow.
 *
 * Column names are the snake_case form of the domain fields and are mapped
 * explicitly: `numeric` arrives as a string, `timestamptz` as a Date, `date` as
 * `YYYY-MM-DD` (see the type override in ./client).
 */

/* ------------------------------------------------------------- helpers -- */

/**
 * A jsonb parameter.
 *
 * `sql.json` tags the value with the jsonb type so the server stores a real
 * JSON document. Interpolating `JSON.stringify(value)` instead looks equivalent
 * and is not: the driver then serialises that string *as a JSON string*, so
 * `[]` is stored as the jsonb scalar `"[]"` and `jsonb_typeof` reports
 * 'string'. Verified against this schema — `obligations_date_conflicts_is_array`
 * rejects the outcome outright, and a jsonb column without such a constraint
 * would silently hold the wrong shape.
 *
 * The cast is the one concession. `DateConflict` is an interface, so it has no
 * implicit index signature and does not structurally satisfy the driver's
 * `JSONValue` even though it is plain JSON-serialisable data. Confining that to
 * this helper keeps it to a single line rather than one per call site.
 */
function jsonb(sql: Sql, value: unknown): postgres.Parameter {
  return sql.json(value as postgres.JSONValue);
}

type ColumnValue = string | number | boolean | null | postgres.Parameter;
type ColumnPatch = Record<string, ColumnValue>;

/**
 * Creation timestamps for one batch, one millisecond apart in input order.
 *
 * The file store stamps each row with its own `new Date()` and then sorts with
 * `Array.prototype.sort`, which is stable — so a batch comes back out of
 * `listObligations` in the order it went in, which is the order the model found
 * the obligations in the document, which is the order the review workspace
 * shows them in. That ordering is user-visible, so it is part of the contract.
 *
 * Postgres offers no such guarantee. `now()` is the *transaction* timestamp, so
 * every row written by one `createObligations` call would share a `created_at`
 * exactly and `order by created_at` could return them in any order.
 * `clock_timestamp()` is evaluated per row but is only documented to be
 * non-decreasing, not strictly increasing, so it cannot break the ties either.
 * Minting the values here is what makes `created_at` a total order.
 *
 * The step is a millisecond rather than a microsecond because a millisecond is
 * all the driver can carry: postgres.js serialises every timestamptz parameter
 * as `new Date(value).toISOString()` (postgres/src/types.js), so anything finer
 * is truncated on the way out no matter how it is written — and the domain
 * model is millisecond ISO strings anyway, so nothing downstream could see it.
 *
 * The cost is that a batch of N rows claims to have been written over the N
 * milliseconds *ending* at the real instant. Backdating rather than
 * forward-dating keeps the useful invariant that a created_at is never in the
 * future, and N milliseconds is far below the resolution at which anything in
 * the product reads this column.
 */
function batchStamps(count: number): string[] {
  const last = Date.now();
  return Array.from({ length: count }, (_, index) =>
    new Date(last - (count - 1 - index)).toISOString(),
  );
}

/* --------------------------------------------------------- obligations -- */

interface ObligationRow {
  id: string;
  award_id: string;
  organization_id: string;
  category: ObligationCategory;
  title: string;
  description: string;
  original_date_text: string | null;
  due_date: string | null;
  recurrence: string | null;
  internal_due_date: string | null;
  suggested_owner_role: string | null;
  assigned_user_id: string | null;
  priority: ObligationPriority;
  confidence: string | number;
  review_status: ReviewStatus;
  interpretation_level: InterpretationLevel;
  consequence: string | null;
  clarification_question: string | null;
  source_status: SourceStatus;
  notes: string | null;
  date_conflicts: DateConflict[] | null;
  origin: Obligation["origin"];
  created_at: Date | string;
  updated_at: Date | string;
}

function mapObligation(row: ObligationRow): Obligation {
  return {
    id: row.id,
    awardId: row.award_id,
    organizationId: row.organization_id,
    category: row.category,
    title: row.title,
    description: row.description,
    originalDateText: row.original_date_text,
    dueDate: toDateOrNull(row.due_date),
    recurrence: row.recurrence,
    internalDueDate: toDateOrNull(row.internal_due_date),
    suggestedOwnerRole: row.suggested_owner_role,
    assignedUserId: row.assigned_user_id,
    priority: row.priority,
    // numeric arrives as a string; 0..1 is enforced by a check constraint.
    confidence: toNumber(row.confidence),
    reviewStatus: row.review_status,
    interpretationLevel: row.interpretation_level,
    consequence: row.consequence,
    clarificationQuestion: row.clarification_question,
    sourceStatus: row.source_status,
    notes: row.notes,
    // Non-nullable in the domain: a null column is an empty collection.
    dateConflicts: row.date_conflicts ?? [],
    origin: row.origin,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * `created_at` and `updated_at` are written explicitly rather than defaulted,
 * so the batch keeps its input order — see `batchStamps`.
 */
const OBLIGATION_INSERT_COLUMNS = [
  "id",
  "award_id",
  "organization_id",
  "category",
  "title",
  "description",
  "original_date_text",
  "due_date",
  "recurrence",
  "internal_due_date",
  "suggested_owner_role",
  "assigned_user_id",
  "priority",
  "confidence",
  "review_status",
  "interpretation_level",
  "consequence",
  "clarification_question",
  "source_status",
  "notes",
  "date_conflicts",
  "origin",
  "created_at",
  "updated_at",
] as const;

const CITATION_INSERT_COLUMNS = [
  "id",
  "obligation_id",
  "document_segment_id",
  "locator_type",
  "locator_value",
  "excerpt",
  "start_offset",
  "end_offset",
  "match_score",
  "created_at",
] as const;

/**
 * Writes a batch of obligations and all of their citations in one transaction.
 *
 * All of it commits or none of it does: an obligation whose citations were lost
 * is an obligation the reviewer cannot trace back to the award text, which is
 * the one thing this product must never show.
 *
 * Ids are generated here, exactly as the file store's `newId()` does, rather
 * than by the `gen_random_uuid()` column default. That is what makes a single
 * bulk INSERT possible: the citations already know their `obligation_id` before
 * anything is sent, so there is no per-row round trip, and the returned rows can
 * be put back into the caller's order by id instead of trusting the order
 * `returning` happens to emit.
 */
export async function createObligations(
  obligations: Omit<Obligation, "id" | "createdAt" | "updatedAt">[],
  citationsFor: (index: number) => Omit<ObligationCitation, "id" | "obligationId" | "createdAt">[],
): Promise<Obligation[]> {
  if (obligations.length === 0) return [];

  const sql = getSql();
  const stamps = batchStamps(obligations.length);

  const obligationRows = obligations.map((input, index) => ({
    id: randomUUID(),
    award_id: input.awardId,
    organization_id: input.organizationId,
    category: input.category,
    title: input.title,
    description: input.description,
    original_date_text: input.originalDateText,
    due_date: input.dueDate,
    recurrence: input.recurrence,
    internal_due_date: input.internalDueDate,
    suggested_owner_role: input.suggestedOwnerRole,
    assigned_user_id: input.assignedUserId,
    priority: input.priority,
    confidence: input.confidence,
    review_status: input.reviewStatus,
    interpretation_level: input.interpretationLevel,
    consequence: input.consequence,
    clarification_question: input.clarificationQuestion,
    source_status: input.sourceStatus,
    notes: input.notes,
    date_conflicts: jsonb(sql, input.dateConflicts),
    origin: input.origin,
    created_at: stamps[index],
    updated_at: stamps[index],
  }));

  // `citationsFor` is called once per obligation, in index order, so the flat
  // list below is exactly the sequence the file store appends to db.citations —
  // which is the order `listCitations` then returns them in.
  const pending = obligationRows.flatMap((row, index) =>
    citationsFor(index).map((citation) => ({ obligationId: row.id, citation })),
  );
  const citationStamps = batchStamps(pending.length);
  const citationRows = pending.map(({ obligationId, citation }, index) => ({
    id: randomUUID(),
    obligation_id: obligationId,
    document_segment_id: citation.documentSegmentId,
    locator_type: citation.locatorType,
    locator_value: citation.locatorValue,
    excerpt: citation.excerpt,
    start_offset: citation.startOffset,
    end_offset: citation.endOffset,
    match_score: citation.matchScore,
    created_at: citationStamps[index],
  }));

  return sql.begin(async (tx) => {
    const inserted = await tx<ObligationRow[]>`
      insert into public.obligations ${tx(obligationRows, OBLIGATION_INSERT_COLUMNS)}
      returning *
    `;

    if (citationRows.length > 0) {
      await tx`
        insert into public.obligation_citations ${tx(citationRows, CITATION_INSERT_COLUMNS)}
      `;
    }

    // Returned in the caller's order rather than whatever order the insert
    // reports, so the result lines up with the input like the file store's does.
    const byId = new Map(inserted.map((row) => [row.id, row]));
    return obligationRows.flatMap((row) => {
      const stored = byId.get(row.id);
      return stored ? [mapObligation(stored)] : [];
    });
  });
}

export async function listObligations(
  awardId: string,
  organizationId: string,
): Promise<Obligation[]> {
  if (!isUuid(awardId) || !isUuid(organizationId)) return [];
  const sql = getSql();
  const rows = await sql<ObligationRow[]>`
    select * from public.obligations
    where award_id = ${awardId} and organization_id = ${organizationId}
    -- id only breaks ties between rows written in the same millisecond, which
    -- createObligations already avoids within a batch; it is here so the order
    -- is total rather than merely usually stable.
    order by created_at asc, id asc
  `;
  return rows.map(mapObligation);
}

/**
 * The file store returns these in insertion order, and the dashboard's
 * "open questions" panel shows the first eight it finds, so the order is
 * user-visible and is reproduced rather than left to the planner.
 */
export async function listObligationsForOrganization(
  organizationId: string,
): Promise<Obligation[]> {
  if (!isUuid(organizationId)) return [];
  const sql = getSql();
  const rows = await sql<ObligationRow[]>`
    select * from public.obligations
    where organization_id = ${organizationId}
    order by created_at asc, id asc
  `;
  return rows.map(mapObligation);
}

export async function getObligation(
  id: string,
  organizationId: string,
): Promise<Obligation | null> {
  if (!isUuid(id) || !isUuid(organizationId)) return null;
  const sql = getSql();
  const [row] = await sql<ObligationRow[]>`
    select * from public.obligations
    where id = ${id} and organization_id = ${organizationId}
  `;
  return row ? mapObligation(row) : null;
}

export async function updateObligation(
  id: string,
  organizationId: string,
  patch: Partial<Obligation>,
): Promise<Obligation | null> {
  if (!isUuid(id) || !isUuid(organizationId)) return null;
  const sql = getSql();

  // The whitelist IS the immutability guarantee: id, award_id, organization_id,
  // created_at and updated_at are absent, so no patch can reach them. A patch
  // carrying a foreign organizationId is therefore ignored rather than obeyed,
  // matching the re-pinning the file store does after Object.assign.
  const updates: ColumnPatch = {};
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.originalDateText !== undefined) updates.original_date_text = patch.originalDateText;
  if (patch.dueDate !== undefined) updates.due_date = patch.dueDate;
  if (patch.recurrence !== undefined) updates.recurrence = patch.recurrence;
  if (patch.internalDueDate !== undefined) updates.internal_due_date = patch.internalDueDate;
  if (patch.suggestedOwnerRole !== undefined) {
    updates.suggested_owner_role = patch.suggestedOwnerRole;
  }
  if (patch.assignedUserId !== undefined) updates.assigned_user_id = patch.assignedUserId;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.confidence !== undefined) updates.confidence = patch.confidence;
  if (patch.reviewStatus !== undefined) updates.review_status = patch.reviewStatus;
  if (patch.interpretationLevel !== undefined) {
    updates.interpretation_level = patch.interpretationLevel;
  }
  if (patch.consequence !== undefined) updates.consequence = patch.consequence;
  if (patch.clarificationQuestion !== undefined) {
    updates.clarification_question = patch.clarificationQuestion;
  }
  if (patch.sourceStatus !== undefined) updates.source_status = patch.sourceStatus;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.dateConflicts !== undefined) updates.date_conflicts = jsonb(sql, patch.dateConflicts);
  if (patch.origin !== undefined) updates.origin = patch.origin;

  // updated_at is maintained by the set_updated_at trigger on this table (0001),
  // which fires on every UPDATE — so it is `now()` on both branches, matching
  // the file store's unconditional `updatedAt: now()`. An empty patch still
  // bumps it and returns the row; `set` cannot be empty, so it is written
  // directly there.
  const [row] = Object.keys(updates).length
    ? await sql<ObligationRow[]>`
        update public.obligations set ${sql(updates)}
        where id = ${id} and organization_id = ${organizationId}
        returning *
      `
    : await sql<ObligationRow[]>`
        update public.obligations set updated_at = now()
        where id = ${id} and organization_id = ${organizationId}
        returning *
      `;

  return row ? mapObligation(row) : null;
}

/**
 * The file store deletes the obligation's citations and reminders by hand; here
 * both cascade from the obligation (0001), so one statement leaves nothing
 * behind.
 */
export async function deleteObligation(id: string, organizationId: string): Promise<boolean> {
  if (!isUuid(id) || !isUuid(organizationId)) return false;
  const sql = getSql();
  const rows = await sql`
    delete from public.obligations
    where id = ${id} and organization_id = ${organizationId}
    returning id
  `;
  return rows.length > 0;
}

/* ----------------------------------------------------------- citations -- */

interface CitationRow {
  id: string;
  obligation_id: string;
  document_segment_id: string | null;
  locator_type: LocatorType;
  locator_value: string;
  excerpt: string;
  start_offset: number | null;
  end_offset: number | null;
  match_score: string | number;
  created_at: Date | string;
}

function mapCitation(row: CitationRow): ObligationCitation {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    documentSegmentId: row.document_segment_id,
    locatorType: row.locator_type,
    locatorValue: row.locator_value,
    excerpt: row.excerpt,
    startOffset: toNumberOrNull(row.start_offset),
    endOffset: toNumberOrNull(row.end_offset),
    // numeric arrives as a string; 0..1 is enforced by a check constraint.
    matchScore: toNumber(row.match_score),
    createdAt: toIso(row.created_at),
  };
}

/**
 * Citations for a set of obligations.
 *
 * Deliberately takes no `organizationId`, matching the reference. The
 * assumption that makes it safe is that the ids always come from an
 * already-scoped query — `listObligations` or `listObligationsForOrganization`,
 * both of which filter by organisation in SQL — so this function never widens
 * what its caller could already see. It is not a general-purpose lookup: given
 * an arbitrary obligation id it will happily return that obligation's
 * citations, so it must not be reached from user-supplied ids. Callers today
 * are `attachCitations` in src/lib/awards/queries.ts, which is fed by exactly
 * those two functions.
 */
export async function listCitations(obligationIds: string[]): Promise<ObligationCitation[]> {
  // `in ()` is a syntax error, so the empty set short-circuits rather than
  // emitting SQL.
  const usable = obligationIds.filter(isUuid);
  if (usable.length === 0) return [];

  const sql = getSql();
  const rows = await sql<CitationRow[]>`
    select * from public.obligation_citations
    where obligation_id in ${sql(usable)}
    -- Insertion order, which is what the file store's array filter returns and
    -- what the stable sort in attachCitations then preserves within equal
    -- match scores.
    order by created_at asc, id asc
  `;
  return rows.map(mapCitation);
}
