import "server-only";

import type postgres from "postgres";

import type {
  AskCitation,
  AskExchange,
  AuditEvent,
  ExportFormat,
  ExportRecord,
  InterpretationLevel,
  NotificationPreferences,
  PlanId,
  Reminder,
  ReminderStatus,
  Subscription,
} from "@/lib/domain/types";

import type { Sql } from "./client";
import { getSql, toIso, toIsoOrNull, toNumber } from "./client";

/**
 * Postgres adapter: reminders, notification preferences, subscriptions,
 * exports, audit events, ask exchanges and organisation-data deletion.
 *
 * `src/lib/db/local.ts` is the contract; this module is a different storage
 * engine for the same observable behaviour. The rules the other adapter modules
 * follow apply here unchanged:
 *
 *   1. Every statement that takes an `organizationId` carries
 *      `and organization_id = $n` in its WHERE clause. Scoping is enforced
 *      here, never assumed of the caller, so a wrong organisation gets
 *      null/false/[] rather than another tenant's compliance record.
 *
 *   2. Updates never assign `id`, `organization_id` or `award_id`. The file
 *      store re-pins them after `Object.assign`; the equivalent here is that
 *      they are absent from every whitelist, so no patch can move a row between
 *      organisations.
 *
 * Three functions deliberately take no `organizationId`, exactly as the
 * reference does not: `listDueReminders` (the cron sweep is global by design,
 * and every row it returns is re-checked against `reminder.organizationId` by
 * `processDueReminders`), `listRemindersForObligation` and `markReminder`
 * (both reached only with ids that came out of an already-scoped read).
 * `claimStripeEvent` is global because Stripe event ids are.
 */

/* ------------------------------------------------------------- helpers -- */

/**
 * jsonb payloads.
 *
 * `sql.json` encodes the value exactly once. A pre-stringified payload is not
 * equivalent: once the statement is prepared the server describes the parameter
 * as jsonb and the driver JSON-encodes it again, storing a JSON *string* that
 * the `..._is_array` / `..._is_object` check constraints reject. The assertion
 * is needed because the domain's interfaces do not structurally satisfy the
 * driver's index-signature JSONValue type.
 */
function jsonb(sql: Sql, value: unknown): postgres.Parameter {
  return sql.json(value as postgres.JSONValue);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when every argument could be a key of a uuid column.
 *
 * The file store compares strings, so an id that does not exist simply finds
 * nothing; Postgres rejects a malformed uuid with error 22P02 instead, which
 * would turn a mistyped id into a 500 rather than the reference's "not found".
 * Guarding keeps "no such record" a null/false/[]/no-op answer. Used only where
 * the reference has such an answer to give — `getNotificationPreferences` and
 * `upsertSubscription` must return a value whatever they are handed, so they
 * are left to the database.
 */
function areIds(...values: string[]): boolean {
  return values.every((value) => UUID_PATTERN.test(value));
}

type ColumnValue = string | number | boolean | null | postgres.Parameter | postgres.Fragment;
type ColumnPatch = Record<string, ColumnValue>;

function now(): string {
  return new Date().toISOString();
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A domain timestamp string as an unambiguous instant.
 *
 * `Reminder.scheduledFor` is a plain `YYYY-MM-DD` in the domain (the scheduler
 * derives it with `addDaysIso`) but `reminders.scheduled_for` is `timestamptz`,
 * so the value has to be pinned to a zone somewhere. Doing it here rather than
 * leaving it to the server is not pedantry: the driver serialises a parameter
 * with the type the *prepared statement* reports, so a bare `'2026-03-01'`
 * would be cast by the server at its TimeZone on the first execution and by
 * `new Date(...).toISOString()` — i.e. UTC — on every execution after that. The
 * same date would land on two different instants depending on how often the
 * statement had run. Midnight UTC, written explicitly, is stable on both paths
 * and is what `fromInstant` reverses.
 */
function toInstant(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value;
}

function toInstantOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : toInstant(value);
}

/**
 * The inverse of `toInstant`: exactly midnight UTC reads back as the calendar
 * date it was written from, anything else as a full ISO timestamp.
 *
 * The reference stores the caller's string verbatim, so `scheduledFor` must
 * round-trip as `YYYY-MM-DD` — `processDueReminders` feeds it straight back to
 * `listDueReminders`, and the reference's `<=` there is a *string* comparison
 * that a full timestamp would silently lose to. The cost is that a genuine
 * midnight-UTC timestamp would come back date-only; nothing writes one, and the
 * alternative breaks the round trip for the only value that is ever written.
 */
function fromInstant(value: Date | string): string {
  const iso = toIso(value);
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/**
 * The order reminders are read back in.
 *
 * The file store returns them in insertion order. Reproducing that needs two
 * things. `created_at` separates the batches — each `replaceReminders` call is
 * one transaction, so `now()` gives every row of a batch the same stamp and
 * every later batch a greater one, which is what keeps an already-sent reminder
 * ahead of the schedule that replaced it. `scheduled_for` then orders within a
 * batch: the scheduler emits its offsets largest first (`[30, 14, 7, 1]`), so
 * insertion order and ascending scheduled date are the same sequence, and a
 * batch cannot contain two rows with the same date because the offsets in it
 * are distinct. `id` makes the order total rather than merely usually stable.
 *
 * Per-row `created_at` values a microsecond apart — the trick
 * `src/lib/db/pg/obligations.ts` uses — cannot work here: once the statement is
 * prepared the driver re-serialises a timestamptz parameter through
 * `new Date(...).toISOString()`, which is millisecond precision, so the
 * distinguishing digits survive the first execution and no other.
 *
 * Both reminder readers below therefore order by
 * `created_at asc, scheduled_for asc, id asc`.
 */

/* ------------------------------------------------------------ reminders -- */

interface ReminderRow {
  id: string;
  obligation_id: string;
  organization_id: string;
  user_id: string;
  offset_days: number | string;
  scheduled_for: Date | string;
  sent_at: Date | string | null;
  status: ReminderStatus;
  idempotency_key: string;
  last_error: string | null;
  created_at: Date | string;
}

function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    offsetDays: toNumber(row.offset_days),
    scheduledFor: fromInstant(row.scheduled_for),
    sentAt: toIsoOrNull(row.sent_at),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    lastError: row.last_error,
    createdAt: toIso(row.created_at),
  };
}

const REMINDER_INSERT_COLUMNS = [
  "obligation_id",
  "organization_id",
  "user_id",
  "offset_days",
  "scheduled_for",
  "sent_at",
  "status",
  "idempotency_key",
  "last_error",
] as const;

/**
 * Replaces an obligation's outstanding reminders.
 *
 * Sent reminders are kept: a sent reminder is a historical fact, and deleting
 * one would let the same email be scheduled and sent a second time. Everything
 * else for the obligation goes, then the new schedule is inserted.
 *
 * Both halves run in one transaction, so a failure part-way cannot leave an
 * obligation with no reminders at all — silently dropping every deadline
 * warning for a grant is exactly the failure this product must not have.
 *
 * Duplicates are refused by the database rather than pre-checked:
 * `reminders_idempotency_key_key` is unique, so `on conflict do nothing` is
 * both the reference's "skip one we already have" and the race-free version of
 * it — two concurrent schedulers cannot both win the insert.
 *
 * Each row carries its own `obligation_id` and `organization_id`, exactly as
 * the reference stores the caller's object verbatim; the parameter governs only
 * which rows are cleared. Every caller passes matching values.
 */
export async function replaceReminders(
  obligationId: string,
  reminders: Omit<Reminder, "id" | "createdAt">[],
): Promise<void> {
  if (!areIds(obligationId)) return;

  const sql = getSql();
  const rows = reminders.map((reminder) => ({
    obligation_id: reminder.obligationId,
    organization_id: reminder.organizationId,
    user_id: reminder.userId,
    offset_days: reminder.offsetDays,
    scheduled_for: toInstant(reminder.scheduledFor),
    sent_at: toInstantOrNull(reminder.sentAt),
    status: reminder.status,
    idempotency_key: reminder.idempotencyKey,
    last_error: reminder.lastError,
  }));

  await sql.begin(async (tx) => {
    await tx`
      delete from public.reminders
      where obligation_id = ${obligationId} and status <> 'sent'
    `;

    if (rows.length > 0) {
      await tx`
        insert into public.reminders ${tx(rows, REMINDER_INSERT_COLUMNS)}
        on conflict (idempotency_key) do nothing
      `;
    }
  });
}

/**
 * Reminders due on or before a date, for the cron sweep.
 *
 * Deliberately unscoped, matching the reference: the sweep runs for every
 * organisation and `processDueReminders` re-reads each reminder's obligation
 * with `reminder.organizationId`, so the scoped read happens there.
 */
export async function listDueReminders(onOrBefore: string): Promise<Reminder[]> {
  const sql = getSql();
  const rows = await sql<ReminderRow[]>`
    select * from public.reminders
    where status = 'scheduled' and scheduled_for <= ${toInstant(onOrBefore)}
    order by created_at asc, scheduled_for asc, id asc
  `;
  return rows.map(mapReminder);
}

export async function listRemindersForObligation(obligationId: string): Promise<Reminder[]> {
  if (!areIds(obligationId)) return [];
  const sql = getSql();
  const rows = await sql<ReminderRow[]>`
    select * from public.reminders
    where obligation_id = ${obligationId}
    order by created_at asc, scheduled_for asc, id asc
  `;
  return rows.map(mapReminder);
}

/**
 * Marks a reminder sent, cancelled or failed.
 *
 * The whitelist is the reference's patchable surface minus the identity
 * columns: `id`, `obligation_id` and `organization_id` are absent, so a patch
 * cannot re-file a reminder under another obligation or organisation. That is
 * marginally stricter than the reference, which re-pins only `id` — no caller
 * patches the other two, and rule 2 of this adapter is that they are never
 * assigned.
 */
export async function markReminder(
  id: string,
  patch: Partial<Reminder>,
): Promise<Reminder | null> {
  if (!areIds(id)) return null;
  const sql = getSql();

  const updates: ColumnPatch = {};
  if (patch.userId !== undefined) updates.user_id = patch.userId;
  if (patch.offsetDays !== undefined) updates.offset_days = patch.offsetDays;
  if (patch.scheduledFor !== undefined) updates.scheduled_for = toInstant(patch.scheduledFor);
  if (patch.sentAt !== undefined) updates.sent_at = toInstantOrNull(patch.sentAt);
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.idempotencyKey !== undefined) updates.idempotency_key = patch.idempotencyKey;
  if (patch.lastError !== undefined) updates.last_error = patch.lastError;

  // reminders has no updated_at, so an empty patch is a plain read — the same
  // "returns the unchanged record" behaviour as the file store.
  if (Object.keys(updates).length === 0) {
    const [existing] = await sql<ReminderRow[]>`
      select * from public.reminders where id = ${id}
    `;
    return existing ? mapReminder(existing) : null;
  }

  const [row] = await sql<ReminderRow[]>`
    update public.reminders set ${sql(updates)}
    where id = ${id}
    returning *
  `;
  return row ? mapReminder(row) : null;
}

/* -------------------------------------------- notification preferences --- */

/** The product default, identical to the reference's and to the column default. */
const DEFAULT_OFFSETS = [30, 14, 7, 1];

interface PreferencesRow {
  user_id: string;
  organization_id: string;
  enabled: boolean;
  offsets: number[] | null;
  updated_at: Date | string;
}

function mapPreferences(row: PreferencesRow): NotificationPreferences {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    enabled: row.enabled,
    // The column is nullable and 0001 documents null as "use the product
    // default", which is what the application returns when no row exists.
    // Turning every offset off is stored as `[]`, not null, so this cannot
    // resurrect reminders a user switched off.
    offsets: row.offsets ?? [...DEFAULT_OFFSETS],
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Preferences for a user in an organisation, or the product default.
 *
 * Reads never write: a user who has not touched their settings has no row, and
 * creating one here would turn a page view into a mutation and record a consent
 * decision the user never made.
 */
export async function getNotificationPreferences(
  userId: string,
  organizationId: string,
): Promise<NotificationPreferences> {
  const sql = getSql();
  const [row] = areIds(userId, organizationId)
    ? await sql<PreferencesRow[]>`
        select * from public.notification_preferences
        where user_id = ${userId} and organization_id = ${organizationId}
      `
    : [];

  if (row) return mapPreferences(row);
  return {
    userId,
    organizationId,
    enabled: true,
    offsets: [...DEFAULT_OFFSETS],
    updatedAt: now(),
  };
}

export async function setNotificationPreferences(
  preferences: Omit<NotificationPreferences, "updatedAt">,
): Promise<NotificationPreferences> {
  const sql = getSql();
  // (user_id, organization_id) is the primary key, so one statement covers both
  // of the reference's branches. updated_at is left to the column default on
  // insert and to the set_updated_at trigger (0001) on update, so it is `now()`
  // either way, matching the reference.
  const [row] = await sql<PreferencesRow[]>`
    insert into public.notification_preferences (user_id, organization_id, enabled, offsets)
    values (
      ${preferences.userId}, ${preferences.organizationId},
      ${preferences.enabled}, ${jsonb(sql, preferences.offsets)}
    )
    on conflict (user_id, organization_id) do update
      set enabled = excluded.enabled, offsets = excluded.offsets
    returning *
  `;
  return mapPreferences(row);
}

/* -------------------------------------------------------- subscriptions -- */

interface SubscriptionRow {
  id: string;
  organization_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanId;
  status: Subscription["status"];
  period_end: Date | string | null;
  award_credits: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    organizationId: row.organization_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    plan: row.plan,
    status: row.status,
    periodEnd: toIsoOrNull(row.period_end),
    awardCredits: toNumber(row.award_credits),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function getSubscription(organizationId: string): Promise<Subscription | null> {
  if (!areIds(organizationId)) return null;
  const sql = getSql();
  const [row] = await sql<SubscriptionRow[]>`
    select * from public.subscriptions where organization_id = ${organizationId}
  `;
  return row ? mapSubscription(row) : null;
}

/**
 * Creates or patches an organisation's subscription.
 *
 * `subscriptions_organization_id_key` (0001) makes `organization_id` unique, so
 * this is a single INSERT ... ON CONFLICT rather than a read-then-write. That
 * matters beyond tidiness: Stripe delivers webhooks concurrently, and the
 * read-then-write shape would let two deliveries both find no row and both try
 * to insert, so one would fail outright. Here the loser of the race updates.
 *
 * The conflict branch sets only the columns the patch actually names, which is
 * what makes it a patch rather than a replace; `id`, `organization_id` and
 * `created_at` are not in the whitelist and cannot be reassigned.
 */
export async function upsertSubscription(
  organizationId: string,
  patch: Partial<Omit<Subscription, "id" | "organizationId" | "createdAt">>,
): Promise<Subscription> {
  const sql = getSql();

  // Seeded so the SET list is never empty (an empty patch still has to return
  // the row, which `do nothing` would not). The trigger would set updated_at
  // anyway; writing it makes the statement valid on its own terms.
  const updates: ColumnPatch = { updated_at: sql`now()` };
  if (patch.stripeCustomerId !== undefined) updates.stripe_customer_id = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined) {
    updates.stripe_subscription_id = patch.stripeSubscriptionId;
  }
  if (patch.plan !== undefined) updates.plan = patch.plan;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.periodEnd !== undefined) updates.period_end = toInstantOrNull(patch.periodEnd);
  if (patch.awardCredits !== undefined) updates.award_credits = patch.awardCredits;

  // The insert branch's defaults are the reference's: no Stripe ids, the demo
  // plan, active, no period end and no credits, each overridden by the patch.
  const [row] = await sql<SubscriptionRow[]>`
    insert into public.subscriptions (
      organization_id, stripe_customer_id, stripe_subscription_id,
      plan, status, period_end, award_credits
    ) values (
      ${organizationId}, ${patch.stripeCustomerId ?? null}, ${patch.stripeSubscriptionId ?? null},
      ${patch.plan ?? "demo"}, ${patch.status ?? "active"},
      ${toInstantOrNull(patch.periodEnd)}, ${patch.awardCredits ?? 0}
    )
    on conflict (organization_id) do update set ${sql(updates)}
    returning *
  `;
  return mapSubscription(row);
}

/**
 * Claims a Stripe event id, returning false if it has already been processed.
 *
 * The insert IS the claim. Checking first and inserting second would leave a
 * window in which two concurrent deliveries of the same webhook both saw an
 * unclaimed event, and the entitlements this gates — award credits, plan
 * upgrades — would be granted twice. `processed_stripe_events.id` is Stripe's
 * own event id and the primary key, so exactly one insert can win and only that
 * one reports a row.
 */
export async function claimStripeEvent(eventId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    insert into public.processed_stripe_events (id)
    values (${eventId})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length > 0;
}

/* -------------------------------------------------- exports and audits --- */

interface ExportRow {
  id: string;
  award_id: string;
  organization_id: string;
  format: ExportFormat;
  storage_path: string | null;
  generated_by: string;
  generated_at: Date | string;
}

function mapExport(row: ExportRow): ExportRecord {
  return {
    id: row.id,
    awardId: row.award_id,
    organizationId: row.organization_id,
    format: row.format,
    storagePath: row.storage_path,
    generatedBy: row.generated_by,
    generatedAt: toIso(row.generated_at),
  };
}

export async function recordExport(
  input: Omit<ExportRecord, "id" | "generatedAt">,
): Promise<ExportRecord> {
  const sql = getSql();
  const [row] = await sql<ExportRow[]>`
    insert into public.exports (
      award_id, organization_id, format, storage_path, generated_by
    ) values (
      ${input.awardId}, ${input.organizationId}, ${input.format},
      ${input.storagePath}, ${input.generatedBy}
    )
    returning *
  `;
  return mapExport(row);
}

interface AuditRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
}

function mapAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    // Non-nullable in the domain; the column is `not null default '{}'`, so
    // this is belt and braces rather than a real case.
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  };
}

/**
 * Appends an audit event.
 *
 * The reference trims its log to the most recent 4000 entries once it passes
 * 5000. That cap exists because the file store holds the whole database in
 * memory and re-serialises it on every write; here the table is append-only by
 * design (0002 grants no delete to anyone but the service role) and an audit
 * trail that quietly discards its own history is worth less than one that
 * grows. The trim is therefore deliberately not reproduced.
 */
export async function recordAuditEvent(
  input: Omit<AuditEvent, "id" | "createdAt">,
): Promise<void> {
  const sql = getSql();
  await sql`
    insert into public.audit_events (
      organization_id, user_id, event_type, entity_type, entity_id, metadata
    ) values (
      ${input.organizationId}, ${input.userId}, ${input.eventType},
      ${input.entityType}, ${input.entityId}, ${jsonb(sql, input.metadata)}
    )
  `;
}

export async function listAuditEvents(organizationId: string, limit = 50): Promise<AuditEvent[]> {
  if (!areIds(organizationId)) return [];
  const sql = getSql();
  const rows = await sql<AuditRow[]>`
    select * from public.audit_events
    where organization_id = ${organizationId}
    -- Newest first, as the reference sorts. Events are written one statement at
    -- a time so each gets its own transaction timestamp; id only makes the
    -- order total rather than merely usually stable.
    order by created_at desc, id desc
    limit ${limit}
  `;
  return rows.map(mapAuditEvent);
}

/* ------------------------------------------------------------------ ask -- */

interface AskRow {
  id: string;
  award_id: string;
  organization_id: string;
  user_id: string;
  question: string;
  answer: string;
  answer_type: AskExchange["answerType"];
  interpretation_level: InterpretationLevel;
  citations: AskCitation[] | null;
  suggested_funder_question: string | null;
  created_at: Date | string;
}

function mapAskExchange(row: AskRow): AskExchange {
  return {
    id: row.id,
    awardId: row.award_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    question: row.question,
    answer: row.answer,
    answerType: row.answer_type,
    interpretationLevel: row.interpretation_level,
    // Non-nullable in the domain: a null column is an empty collection.
    citations: row.citations ?? [],
    suggestedFunderQuestion: row.suggested_funder_question,
    createdAt: toIso(row.created_at),
  };
}

export async function createAskExchange(
  input: Omit<AskExchange, "id" | "createdAt">,
): Promise<AskExchange> {
  const sql = getSql();
  const [row] = await sql<AskRow[]>`
    insert into public.ask_exchanges (
      award_id, organization_id, user_id, question, answer, answer_type,
      interpretation_level, citations, suggested_funder_question
    ) values (
      ${input.awardId}, ${input.organizationId}, ${input.userId}, ${input.question},
      ${input.answer}, ${input.answerType}, ${input.interpretationLevel},
      ${jsonb(sql, input.citations)}, ${input.suggestedFunderQuestion}
    )
    returning *
  `;
  return mapAskExchange(row);
}

/** Oldest first: the transcript reads as a conversation, as the reference sorts it. */
export async function listAskExchanges(
  awardId: string,
  organizationId: string,
): Promise<AskExchange[]> {
  if (!areIds(awardId, organizationId)) return [];
  const sql = getSql();
  const rows = await sql<AskRow[]>`
    select * from public.ask_exchanges
    where award_id = ${awardId} and organization_id = ${organizationId}
    order by created_at asc, id asc
  `;
  return rows.map(mapAskExchange);
}

/* ------------------------------------------------------ account deletion -- */

/**
 * Removes every record belonging to an organisation, including document bytes.
 *
 * One transaction: a partial deletion is the worst outcome available here,
 * because the user has been told their data is gone. Either all of it goes or
 * none of it does and the action reports a failure.
 *
 * The order below deletes each organisation-owned table explicitly even where a
 * cascade would reach it. Cascades from `awards` (documents, obligations, runs,
 * exports, ask exchanges) and from `obligations` (citations, reminders) do most
 * of the work, but relying on them alone would leave the statement's
 * correctness dependent on FK definitions rather than stated here, and children
 * are cleared before their parents so no cascade has to fire mid-way.
 *
 * Document bytes: `saveDocumentBytes` in this adapter stores them inline in
 * `documents.content` (0004), so the bytes are part of the row and go with it.
 * There is no separate blob to sweep, and `document_segments` — the verbatim
 * text of those documents — cascades from `documents`.
 *
 * KNOWN DEVIATION from the button's "delete everything" label, matching the
 * reference exactly: `profiles`, `organizations` and `organization_members`
 * survive. The organisation row is what `awards.created_by` and
 * `exports.generated_by` restrict against and what the user's session resolves
 * to, so removing it here would either fail or sign the user out of an account
 * that still exists. Deleting the account itself is a separate path
 * (supabase/README.md, "Deleting a user"); this clears the content.
 */
export async function deleteOrganizationData(organizationId: string): Promise<void> {
  if (!areIds(organizationId)) return;
  const sql = getSql();

  await sql.begin(async (tx) => {
    await tx`delete from public.reminders where organization_id = ${organizationId}`;
    // Cascades to obligation_citations.
    await tx`delete from public.obligations where organization_id = ${organizationId}`;
    await tx`delete from public.ask_exchanges where organization_id = ${organizationId}`;
    await tx`delete from public.exports where organization_id = ${organizationId}`;
    await tx`delete from public.processing_runs where organization_id = ${organizationId}`;
    // Cascades to document_segments; the inline bytes go with the row.
    await tx`delete from public.documents where organization_id = ${organizationId}`;
    await tx`delete from public.awards where organization_id = ${organizationId}`;
    await tx`delete from public.subscriptions where organization_id = ${organizationId}`;
    await tx`delete from public.audit_events where organization_id = ${organizationId}`;
    await tx`
      delete from public.notification_preferences where organization_id = ${organizationId}
    `;
  });
}
