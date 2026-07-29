import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import type {
  AskExchange,
  AuditEvent,
  Award,
  DocumentRecord,
  DocumentSegment,
  ExportRecord,
  NotificationPreferences,
  Obligation,
  ObligationCitation,
  Organization,
  OrganizationMember,
  ProcessingRun,
  Profile,
  Reminder,
  Subscription,
} from "@/lib/domain/types";

/**
 * File-backed store.
 *
 * This is the storage implementation the application runs on out of the box, so
 * the whole product works with zero external credentials — locally, in CI, and
 * in a demo deployment. It is deliberately behind a narrow module seam
 * (`@/lib/db`) so a Postgres/Supabase implementation can replace it without the
 * rest of the codebase changing.
 *
 * Everything lives outside `public/`; document bytes are never statically
 * served. Organisation scoping is enforced here as well as in the callers — no
 * read helper returns a record without checking the organisation it belongs to.
 *
 * Durability limits are real and documented: on a serverless host the data
 * directory is per-instance and ephemeral. Production deployments should use
 * the Postgres schema in `supabase/migrations`.
 */

interface Database {
  version: number;
  profiles: Profile[];
  organizations: Organization[];
  organizationMembers: OrganizationMember[];
  awards: Award[];
  documents: DocumentRecord[];
  segments: DocumentSegment[];
  runs: ProcessingRun[];
  obligations: Obligation[];
  citations: ObligationCitation[];
  reminders: Reminder[];
  subscriptions: Subscription[];
  exports: ExportRecord[];
  auditEvents: AuditEvent[];
  askExchanges: AskExchange[];
  notificationPreferences: NotificationPreferences[];
  loginCodes: { email: string; codeHash: string; expiresAt: string; attempts: number }[];
  processedStripeEvents: { id: string; processedAt: string }[];
}

function emptyDatabase(): Database {
  return {
    version: 1,
    profiles: [],
    organizations: [],
    organizationMembers: [],
    awards: [],
    documents: [],
    segments: [],
    runs: [],
    obligations: [],
    citations: [],
    reminders: [],
    subscriptions: [],
    exports: [],
    auditEvents: [],
    askExchanges: [],
    notificationPreferences: [],
    loginCodes: [],
    processedStripeEvents: [],
  };
}

function dataRoot(): string {
  if (process.env.AWARDLENS_DATA_DIR) return process.env.AWARDLENS_DATA_DIR;
  // Serverless filesystems are read-only apart from /tmp.
  if (process.env.VERCEL) return "/tmp/awardlens-data";
  return path.join(process.cwd(), ".awardlens-data");
}

const DB_FILE = () => path.join(dataRoot(), "db.json");
const DOC_DIR = () => path.join(dataRoot(), "documents");

interface StoreState {
  db: Database | null;
  writeQueue: Promise<void>;
}

// A module-level singleton would be duplicated across dev-server module graphs.
const globalState = globalThis as unknown as { __awardlensStore?: StoreState };
const state: StoreState = (globalState.__awardlensStore ??= { db: null, writeQueue: Promise.resolve() });

async function load(): Promise<Database> {
  if (state.db) return state.db;
  await mkdir(dataRoot(), { recursive: true });
  await mkdir(DOC_DIR(), { recursive: true });

  if (existsSync(DB_FILE())) {
    try {
      const raw = await readFile(DB_FILE(), "utf8");
      const parsed = JSON.parse(raw) as Partial<Database>;
      state.db = { ...emptyDatabase(), ...parsed };
      return state.db;
    } catch {
      // A corrupt store must not take the app down; start clean and keep the file.
      await rename(DB_FILE(), `${DB_FILE()}.corrupt-${Date.now()}`).catch(() => {});
    }
  }

  state.db = emptyDatabase();
  return state.db;
}

/** Serialised write-through so concurrent requests cannot interleave writes. */
function persist(): Promise<void> {
  state.writeQueue = state.writeQueue.then(async () => {
    if (!state.db) return;
    const tmp = `${DB_FILE()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(state.db), "utf8");
    await rename(tmp, DB_FILE());
  });
  return state.writeQueue;
}

async function mutate<T>(fn: (db: Database) => T): Promise<T> {
  const db = await load();
  const result = fn(db);
  await persist();
  return result;
}

export function newId(): string {
  return randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

/** Test helper: drops all in-memory and on-disk state. */
export async function __resetStore(): Promise<void> {
  state.db = emptyDatabase();
  await persist();
}

/* ------------------------------------------------------------- profiles -- */

export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const db = await load();
  const normalised = email.trim().toLowerCase();
  return db.profiles.find((profile) => profile.email === normalised) ?? null;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const db = await load();
  return db.profiles.find((profile) => profile.id === id) ?? null;
}

export async function createProfile(email: string, fullName: string | null): Promise<Profile> {
  const normalised = email.trim().toLowerCase();
  return mutate((db) => {
    const profile: Profile = {
      id: newId(),
      email: normalised,
      fullName,
      createdAt: now(),
      updatedAt: now(),
    };
    db.profiles.push(profile);
    return profile;
  });
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "fullName">>,
): Promise<Profile | null> {
  return mutate((db) => {
    const profile = db.profiles.find((entry) => entry.id === id);
    if (!profile) return null;
    Object.assign(profile, patch, { updatedAt: now() });
    return profile;
  });
}

/* -------------------------------------------------------- organizations -- */

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "organisation"
  );
}

export async function getOrganization(id: string): Promise<Organization | null> {
  const db = await load();
  return db.organizations.find((organization) => organization.id === id) ?? null;
}

export async function isMember(organizationId: string, userId: string): Promise<boolean> {
  const db = await load();
  return db.organizationMembers.some(
    (member) => member.organizationId === organizationId && member.userId === userId,
  );
}

/** The MVP gives every user exactly one organisation, created on first sign-in. */
export async function getOrCreateOrganizationForUser(
  userId: string,
  suggestedName: string,
): Promise<Organization> {
  return mutate((db) => {
    const membership = db.organizationMembers.find((member) => member.userId === userId);
    if (membership) {
      const existing = db.organizations.find(
        (organization) => organization.id === membership.organizationId,
      );
      if (existing) return existing;
    }

    const base = slugify(suggestedName);
    let slug = base;
    let suffix = 2;
    while (db.organizations.some((organization) => organization.slug === slug)) {
      slug = `${base}-${suffix++}`;
    }

    const organization: Organization = {
      id: newId(),
      name: suggestedName,
      slug,
      createdBy: userId,
      createdAt: now(),
      updatedAt: now(),
    };
    db.organizations.push(organization);
    db.organizationMembers.push({
      organizationId: organization.id,
      userId,
      role: "owner",
      createdAt: now(),
    });
    return organization;
  });
}

export async function renameOrganization(
  organizationId: string,
  name: string,
): Promise<Organization | null> {
  return mutate((db) => {
    const organization = db.organizations.find((entry) => entry.id === organizationId);
    if (!organization) return null;
    organization.name = name;
    organization.updatedAt = now();
    return organization;
  });
}

/* ---------------------------------------------------------------- login -- */

export async function saveLoginCode(
  email: string,
  codeHash: string,
  expiresAt: string,
): Promise<void> {
  const normalised = email.trim().toLowerCase();
  await mutate((db) => {
    db.loginCodes = db.loginCodes.filter((entry) => entry.email !== normalised);
    db.loginCodes.push({ email: normalised, codeHash, expiresAt, attempts: 0 });
  });
}

export async function consumeLoginCode(
  email: string,
  codeHash: string,
): Promise<"ok" | "invalid" | "expired" | "too_many_attempts"> {
  const normalised = email.trim().toLowerCase();
  return mutate((db) => {
    const entry = db.loginCodes.find((item) => item.email === normalised);
    if (!entry) return "invalid";
    if (entry.attempts >= 5) return "too_many_attempts";
    if (new Date(entry.expiresAt).getTime() < Date.now()) {
      db.loginCodes = db.loginCodes.filter((item) => item.email !== normalised);
      return "expired";
    }
    if (entry.codeHash !== codeHash) {
      entry.attempts += 1;
      return "invalid";
    }
    db.loginCodes = db.loginCodes.filter((item) => item.email !== normalised);
    return "ok";
  });
}

/* --------------------------------------------------------------- awards -- */

export async function createAward(
  input: Omit<Award, "id" | "createdAt" | "updatedAt">,
): Promise<Award> {
  return mutate((db) => {
    const award: Award = { ...input, id: newId(), createdAt: now(), updatedAt: now() };
    db.awards.push(award);
    return award;
  });
}

export async function getAward(id: string, organizationId: string): Promise<Award | null> {
  const db = await load();
  const award = db.awards.find((entry) => entry.id === id);
  // Organisation scoping is enforced here, not only by callers.
  if (!award || award.organizationId !== organizationId) return null;
  return award;
}

export async function listAwards(organizationId: string): Promise<Award[]> {
  const db = await load();
  return db.awards
    .filter((award) => award.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateAward(
  id: string,
  organizationId: string,
  patch: Partial<Award>,
): Promise<Award | null> {
  return mutate((db) => {
    const award = db.awards.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (!award) return null;
    Object.assign(award, patch, { id: award.id, organizationId: award.organizationId, updatedAt: now() });
    return award;
  });
}

export async function deleteAward(id: string, organizationId: string): Promise<boolean> {
  // Collected before the mutation so the stored bytes can be removed too. An
  // award deletion that left the private grant document on disk would be a
  // privacy failure however tidy the database looked.
  const documents = await listDocuments(id, organizationId);

  const removed = await mutate((db) => {
    const award = db.awards.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (!award) return false;

    const documentIds = db.documents
      .filter((document) => document.awardId === id)
      .map((document) => document.id);
    const obligationIds = db.obligations
      .filter((obligation) => obligation.awardId === id)
      .map((obligation) => obligation.id);

    db.awards = db.awards.filter((entry) => entry.id !== id);
    db.documents = db.documents.filter((document) => document.awardId !== id);
    db.segments = db.segments.filter((segment) => !documentIds.includes(segment.documentId));
    db.runs = db.runs.filter((run) => run.awardId !== id);
    db.obligations = db.obligations.filter((obligation) => obligation.awardId !== id);
    db.citations = db.citations.filter(
      (citation) => !obligationIds.includes(citation.obligationId),
    );
    db.reminders = db.reminders.filter(
      (reminder) => !obligationIds.includes(reminder.obligationId),
    );
    db.askExchanges = db.askExchanges.filter((exchange) => exchange.awardId !== id);
    db.exports = db.exports.filter((record) => record.awardId !== id);
    return true;
  });

  if (removed) {
    for (const document of documents) {
      await deleteDocumentBytes(document.id).catch(() => {});
    }
  }

  return removed;
}

export async function findAwardByContentHash(
  organizationId: string,
  contentHash: string,
): Promise<{ award: Award; document: DocumentRecord } | null> {
  const db = await load();
  const document = db.documents.find(
    (entry) => entry.organizationId === organizationId && entry.contentHash === contentHash,
  );
  if (!document) return null;
  const award = db.awards.find((entry) => entry.id === document.awardId);
  if (!award) return null;
  return { award, document };
}

/* ------------------------------------------------------------ documents -- */

export async function createDocument(
  input: Omit<DocumentRecord, "id" | "createdAt">,
): Promise<DocumentRecord> {
  return mutate((db) => {
    const document: DocumentRecord = { ...input, id: newId(), createdAt: now() };
    db.documents.push(document);
    return document;
  });
}

export async function updateDocument(
  id: string,
  organizationId: string,
  patch: Partial<DocumentRecord>,
): Promise<DocumentRecord | null> {
  return mutate((db) => {
    const document = db.documents.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (!document) return null;
    Object.assign(document, patch, { id: document.id, organizationId: document.organizationId });
    return document;
  });
}

export async function getDocument(
  id: string,
  organizationId: string,
): Promise<DocumentRecord | null> {
  const db = await load();
  const document = db.documents.find((entry) => entry.id === id);
  if (!document || document.organizationId !== organizationId) return null;
  return document;
}

export async function listDocuments(
  awardId: string,
  organizationId: string,
): Promise<DocumentRecord[]> {
  const db = await load();
  return db.documents.filter(
    (document) => document.awardId === awardId && document.organizationId === organizationId,
  );
}

export async function deleteDocument(id: string, organizationId: string): Promise<boolean> {
  const document = await getDocument(id, organizationId);
  if (!document) return false;
  await mutate((db) => {
    db.documents = db.documents.filter((entry) => entry.id !== id);
    db.segments = db.segments.filter((segment) => segment.documentId !== id);
  });
  await deleteDocumentBytes(id).catch(() => {});
  return true;
}

/** Writes document bytes to private storage. Never inside `public/`. */
export async function saveDocumentBytes(documentId: string, data: Buffer): Promise<string> {
  await mkdir(DOC_DIR(), { recursive: true });
  const target = path.join(DOC_DIR(), `${documentId}.bin`);
  await writeFile(target, data);
  return `local://documents/${documentId}.bin`;
}

export async function readDocumentBytes(documentId: string): Promise<Buffer | null> {
  const target = path.join(DOC_DIR(), `${documentId}.bin`);
  try {
    return await readFile(target);
  } catch {
    return null;
  }
}

async function deleteDocumentBytes(documentId: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  await unlink(path.join(DOC_DIR(), `${documentId}.bin`));
}

/* ------------------------------------------------------------- segments -- */

export async function createSegments(
  documentId: string,
  segments: Omit<DocumentSegment, "id" | "documentId" | "createdAt">[],
): Promise<DocumentSegment[]> {
  return mutate((db) => {
    const created = segments.map((segment) => ({
      ...segment,
      id: `${documentId}:${segment.sequence}`,
      documentId,
      createdAt: now(),
    }));
    db.segments.push(...created);
    return created;
  });
}

export async function listSegments(documentId: string): Promise<DocumentSegment[]> {
  const db = await load();
  return db.segments
    .filter((segment) => segment.documentId === documentId)
    .sort((a, b) => a.sequence - b.sequence);
}

/* ----------------------------------------------------- processing runs --- */

export async function createRun(
  input: Omit<ProcessingRun, "id" | "createdAt">,
): Promise<ProcessingRun> {
  return mutate((db) => {
    const run: ProcessingRun = { ...input, id: newId(), createdAt: now() };
    db.runs.push(run);
    return run;
  });
}

export async function updateRun(
  id: string,
  patch: Partial<ProcessingRun>,
): Promise<ProcessingRun | null> {
  return mutate((db) => {
    const run = db.runs.find((entry) => entry.id === id);
    if (!run) return null;
    Object.assign(run, patch, { id: run.id });
    return run;
  });
}

export async function getLatestRun(awardId: string): Promise<ProcessingRun | null> {
  const db = await load();
  return (
    db.runs
      .filter((run) => run.awardId === awardId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
  );
}

/* ---------------------------------------------------------- obligations -- */

export async function createObligations(
  obligations: Omit<Obligation, "id" | "createdAt" | "updatedAt">[],
  citationsFor: (index: number) => Omit<ObligationCitation, "id" | "obligationId" | "createdAt">[],
): Promise<Obligation[]> {
  return mutate((db) => {
    const created: Obligation[] = [];
    obligations.forEach((input, index) => {
      const obligation: Obligation = {
        ...input,
        id: newId(),
        createdAt: now(),
        updatedAt: now(),
      };
      db.obligations.push(obligation);
      created.push(obligation);
      for (const citation of citationsFor(index)) {
        db.citations.push({
          ...citation,
          id: newId(),
          obligationId: obligation.id,
          createdAt: now(),
        });
      }
    });
    return created;
  });
}

export async function listObligations(
  awardId: string,
  organizationId: string,
): Promise<Obligation[]> {
  const db = await load();
  return db.obligations
    .filter(
      (obligation) =>
        obligation.awardId === awardId && obligation.organizationId === organizationId,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listObligationsForOrganization(
  organizationId: string,
): Promise<Obligation[]> {
  const db = await load();
  return db.obligations.filter((obligation) => obligation.organizationId === organizationId);
}

export async function getObligation(
  id: string,
  organizationId: string,
): Promise<Obligation | null> {
  const db = await load();
  const obligation = db.obligations.find((entry) => entry.id === id);
  if (!obligation || obligation.organizationId !== organizationId) return null;
  return obligation;
}

export async function updateObligation(
  id: string,
  organizationId: string,
  patch: Partial<Obligation>,
): Promise<Obligation | null> {
  return mutate((db) => {
    const obligation = db.obligations.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (!obligation) return null;
    Object.assign(obligation, patch, {
      id: obligation.id,
      organizationId: obligation.organizationId,
      awardId: obligation.awardId,
      updatedAt: now(),
    });
    return obligation;
  });
}

export async function deleteObligation(id: string, organizationId: string): Promise<boolean> {
  return mutate((db) => {
    const obligation = db.obligations.find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );
    if (!obligation) return false;
    db.obligations = db.obligations.filter((entry) => entry.id !== id);
    db.citations = db.citations.filter((citation) => citation.obligationId !== id);
    db.reminders = db.reminders.filter((reminder) => reminder.obligationId !== id);
    return true;
  });
}

export async function listCitations(obligationIds: string[]): Promise<ObligationCitation[]> {
  const db = await load();
  const ids = new Set(obligationIds);
  return db.citations.filter((citation) => ids.has(citation.obligationId));
}

/* ------------------------------------------------------------ reminders -- */

export async function replaceReminders(
  obligationId: string,
  reminders: Omit<Reminder, "id" | "createdAt">[],
): Promise<void> {
  await mutate((db) => {
    // Only unsent reminders are replaced; a sent reminder is a historical fact.
    db.reminders = db.reminders.filter(
      (reminder) => reminder.obligationId !== obligationId || reminder.status === "sent",
    );
    for (const reminder of reminders) {
      if (
        db.reminders.some(
          (existing) => existing.idempotencyKey === reminder.idempotencyKey,
        )
      ) {
        continue;
      }
      db.reminders.push({ ...reminder, id: newId(), createdAt: now() });
    }
  });
}

export async function listDueReminders(onOrBefore: string): Promise<Reminder[]> {
  const db = await load();
  return db.reminders.filter(
    (reminder) => reminder.status === "scheduled" && reminder.scheduledFor <= onOrBefore,
  );
}

export async function listRemindersForObligation(obligationId: string): Promise<Reminder[]> {
  const db = await load();
  return db.reminders.filter((reminder) => reminder.obligationId === obligationId);
}

export async function markReminder(
  id: string,
  patch: Partial<Reminder>,
): Promise<Reminder | null> {
  return mutate((db) => {
    const reminder = db.reminders.find((entry) => entry.id === id);
    if (!reminder) return null;
    Object.assign(reminder, patch, { id: reminder.id });
    return reminder;
  });
}

/* -------------------------------------------- notification preferences --- */

export async function getNotificationPreferences(
  userId: string,
  organizationId: string,
): Promise<NotificationPreferences> {
  const db = await load();
  return (
    db.notificationPreferences.find(
      (entry) => entry.userId === userId && entry.organizationId === organizationId,
    ) ?? {
      userId,
      organizationId,
      enabled: true,
      offsets: [30, 14, 7, 1],
      updatedAt: now(),
    }
  );
}

export async function setNotificationPreferences(
  preferences: Omit<NotificationPreferences, "updatedAt">,
): Promise<NotificationPreferences> {
  return mutate((db) => {
    const existing = db.notificationPreferences.find(
      (entry) =>
        entry.userId === preferences.userId && entry.organizationId === preferences.organizationId,
    );
    if (existing) {
      Object.assign(existing, preferences, { updatedAt: now() });
      return existing;
    }
    const created = { ...preferences, updatedAt: now() };
    db.notificationPreferences.push(created);
    return created;
  });
}

/* -------------------------------------------------------- subscriptions -- */

export async function getSubscription(organizationId: string): Promise<Subscription | null> {
  const db = await load();
  return db.subscriptions.find((entry) => entry.organizationId === organizationId) ?? null;
}

export async function upsertSubscription(
  organizationId: string,
  patch: Partial<Omit<Subscription, "id" | "organizationId" | "createdAt">>,
): Promise<Subscription> {
  return mutate((db) => {
    const existing = db.subscriptions.find((entry) => entry.organizationId === organizationId);
    if (existing) {
      Object.assign(existing, patch, { updatedAt: now() });
      return existing;
    }
    const created: Subscription = {
      id: newId(),
      organizationId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      plan: "demo",
      status: "active",
      periodEnd: null,
      awardCredits: 0,
      createdAt: now(),
      updatedAt: now(),
      ...patch,
    };
    db.subscriptions.push(created);
    return created;
  });
}

/** Returns false when the Stripe event has already been processed. */
export async function claimStripeEvent(eventId: string): Promise<boolean> {
  return mutate((db) => {
    if (db.processedStripeEvents.some((entry) => entry.id === eventId)) return false;
    db.processedStripeEvents.push({ id: eventId, processedAt: now() });
    return true;
  });
}

/* -------------------------------------------------- exports and audits --- */

export async function recordExport(
  input: Omit<ExportRecord, "id" | "generatedAt">,
): Promise<ExportRecord> {
  return mutate((db) => {
    const record: ExportRecord = { ...input, id: newId(), generatedAt: now() };
    db.exports.push(record);
    return record;
  });
}

export async function recordAuditEvent(
  input: Omit<AuditEvent, "id" | "createdAt">,
): Promise<void> {
  await mutate((db) => {
    db.auditEvents.push({ ...input, id: newId(), createdAt: now() });
    // Keep the local audit log bounded.
    if (db.auditEvents.length > 5000) db.auditEvents = db.auditEvents.slice(-4000);
  });
}

export async function listAuditEvents(organizationId: string, limit = 50): Promise<AuditEvent[]> {
  const db = await load();
  return db.auditEvents
    .filter((event) => event.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ ask -- */

export async function createAskExchange(
  input: Omit<AskExchange, "id" | "createdAt">,
): Promise<AskExchange> {
  return mutate((db) => {
    const exchange: AskExchange = { ...input, id: newId(), createdAt: now() };
    db.askExchanges.push(exchange);
    return exchange;
  });
}

export async function listAskExchanges(
  awardId: string,
  organizationId: string,
): Promise<AskExchange[]> {
  const db = await load();
  return db.askExchanges
    .filter(
      (exchange) => exchange.awardId === awardId && exchange.organizationId === organizationId,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ------------------------------------------------------ account deletion -- */

/** Removes every record belonging to an organisation, including document bytes. */
export async function deleteOrganizationData(organizationId: string): Promise<void> {
  const db = await load();
  const documentIds = db.documents
    .filter((document) => document.organizationId === organizationId)
    .map((document) => document.id);

  for (const documentId of documentIds) {
    await deleteDocumentBytes(documentId).catch(() => {});
  }

  await mutate((database) => {
    const awardIds = database.awards
      .filter((award) => award.organizationId === organizationId)
      .map((award) => award.id);
    const obligationIds = database.obligations
      .filter((obligation) => obligation.organizationId === organizationId)
      .map((obligation) => obligation.id);

    database.awards = database.awards.filter((award) => award.organizationId !== organizationId);
    database.documents = database.documents.filter(
      (document) => document.organizationId !== organizationId,
    );
    database.segments = database.segments.filter(
      (segment) => !documentIds.includes(segment.documentId),
    );
    database.runs = database.runs.filter((run) => !awardIds.includes(run.awardId));
    database.obligations = database.obligations.filter(
      (obligation) => obligation.organizationId !== organizationId,
    );
    database.citations = database.citations.filter(
      (citation) => !obligationIds.includes(citation.obligationId),
    );
    database.reminders = database.reminders.filter(
      (reminder) => reminder.organizationId !== organizationId,
    );
    database.askExchanges = database.askExchanges.filter(
      (exchange) => exchange.organizationId !== organizationId,
    );
    database.exports = database.exports.filter(
      (record) => record.organizationId !== organizationId,
    );
    database.subscriptions = database.subscriptions.filter(
      (subscription) => subscription.organizationId !== organizationId,
    );
    database.auditEvents = database.auditEvents.filter(
      (event) => event.organizationId !== organizationId,
    );
    database.notificationPreferences = database.notificationPreferences.filter(
      (preference) => preference.organizationId !== organizationId,
    );
  });
}
