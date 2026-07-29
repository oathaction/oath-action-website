import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as db from "@/lib/db/local";
import { ingestDocument } from "@/lib/awards/process";
import { attachCitations, getAwardWorkspace, getDashboardData } from "@/lib/awards/queries";
import { obligationsToCsv } from "@/lib/exports/csv";
import { obligationsToIcs } from "@/lib/exports/ics";
import { buildJsonExport } from "@/lib/exports/json";
import { syncRemindersForObligation, processDueReminders } from "@/lib/reminders";
import { SAMPLE_AWARD_TEXT } from "@/lib/samples/sample-award";
import type { Session } from "@/lib/auth";

/**
 * Integration coverage for the real ingestion pipeline against the real file
 * store — no mocks. These tests are what justify the claim that the product
 * works: they run the same code path an upload takes.
 */

let dataDir: string;

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(FIXTURES, name));
}

async function makeSession(email: string, orgName: string): Promise<Session> {
  const profile = (await db.findProfileByEmail(email)) ?? (await db.createProfile(email, null));
  const organization = await db.getOrCreateOrganizationForUser(profile.id, orgName);
  return { profile, organization };
}

async function ingestText(session: Session, text: string, name: string) {
  return ingestDocument({
    session,
    kind: "text",
    sourceType: "text",
    filename: `${name}.txt`,
    mimeType: "text/plain",
    bytes: Buffer.from(text, "utf8"),
    awardName: name,
  });
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "awardlens-itest-"));
  process.env.AWARDLENS_DATA_DIR = dataDir;
  process.env.USE_DETERMINISTIC_AI_FIXTURES = "true";
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.__resetStore();
});

describe("document ingestion", () => {
  it("turns an uploaded award into a cited obligation register", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const workspace = await getAwardWorkspace(result.awardId, session.organization.id);
    expect(workspace).not.toBeNull();
    if (!workspace) return;

    expect(workspace.obligations.length).toBeGreaterThanOrEqual(5);

    // The document's identity was actually read out of the text.
    expect(workspace.award.status).toBe("active");
    expect(workspace.documents).toHaveLength(1);
    expect(workspace.documents[0].parserStatus).toBe("parsed");
    expect(workspace.documents[0].pageCount).toBeGreaterThan(1);
  });

  it("stores every extracted obligation as unreviewed", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const workspace = await getAwardWorkspace(result.awardId, session.organization.id);
    const statuses = new Set(workspace?.obligations.map((o) => o.reviewStatus));

    // The extractor may never mark its own output confirmed.
    expect([...statuses]).toEqual(["needs_review"]);
  });

  it("gives every obligation a citation that resolves to stored document text", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const workspace = await getAwardWorkspace(result.awardId, session.organization.id);
    if (!workspace) throw new Error("no workspace");

    const segments = await db.listSegments(workspace.documents[0].id);
    const segmentText = new Map(segments.map((segment) => [segment.id, segment.text]));

    for (const obligation of workspace.obligations) {
      // Either it carries verifiable evidence, or it is visibly flagged.
      const verified = obligation.citations.filter((c) => c.documentSegmentId !== null);
      if (verified.length === 0) {
        expect(obligation.sourceStatus).toBe("unverified");
        continue;
      }

      for (const citation of verified) {
        const source = segmentText.get(citation.documentSegmentId as string);
        expect(source, `citation points at a real stored segment`).toBeDefined();
        // The quoted excerpt is genuinely present in the segment it cites.
        const normalise = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
        expect(normalise(source as string)).toContain(normalise(citation.excerpt));
      }
    }
  });

  it("returns the existing award when the same bytes are uploaded twice", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const first = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    const second = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant again");

    if (!first.ok || !second.ok) throw new Error("ingest failed");
    expect(second.duplicate).toBe(true);
    expect(second.awardId).toBe(first.awardId);
    expect(await db.listAwards(session.organization.id)).toHaveLength(1);
  });

  it("refuses a document with no usable text instead of sending it onward", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const bytes = await fixture("11-empty-scanned.txt");

    const result = await ingestDocument({
      session,
      kind: "text",
      sourceType: "text",
      filename: "scan.txt",
      mimeType: "text/plain",
      bytes,
      awardName: "Scanned",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("no_text");
    expect(result.error.message).toMatch(/not enough text|scan/i);
  });

  it("flags a document that is not a grant at all", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const bytes = await fixture("10-non-grant-document.txt");

    const result = await ingestDocument({
      session,
      kind: "text",
      sourceType: "text",
      filename: "lease.txt",
      mimeType: "text/plain",
      bytes,
      awardName: "Office lease",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join(" ")).toMatch(/not.*(appear|read).*(grant|award)/i);
  });

  it("ignores instructions embedded in a document and still extracts its real obligations", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const bytes = await fixture("09-prompt-injection.txt");

    const result = await ingestDocument({
      session,
      kind: "text",
      sourceType: "text",
      filename: "injected.txt",
      mimeType: "text/plain",
      bytes,
      awardName: "Injected award",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The injection is reported to the user rather than silently handled.
    expect(result.warnings.join(" ")).toMatch(/look like instructions/i);

    const workspace = await getAwardWorkspace(result.awardId, session.organization.id);
    // The injected text told the reader there were no reporting requirements.
    expect(workspace?.obligations.length).toBeGreaterThan(0);
    expect(workspace?.obligations.every((o) => o.reviewStatus === "needs_review")).toBe(true);
  });
});

describe("organisation isolation", () => {
  it("does not let another organisation read an award, its obligations or its documents", async () => {
    const alice = await makeSession("alice@alpha.org", "Alpha");
    const bob = await makeSession("bob@beta.org", "Beta");
    expect(alice.organization.id).not.toBe(bob.organization.id);

    const result = await ingestText(alice, SAMPLE_AWARD_TEXT, "Alpha grant");
    if (!result.ok) throw new Error("ingest failed");

    // Direct object reference with a known-good id, from the wrong organisation.
    expect(await db.getAward(result.awardId, bob.organization.id)).toBeNull();
    expect(await db.listObligations(result.awardId, bob.organization.id)).toEqual([]);
    expect(await getAwardWorkspace(result.awardId, bob.organization.id)).toBeNull();

    const documents = await db.listDocuments(result.awardId, alice.organization.id);
    expect(await db.getDocument(documents[0].id, bob.organization.id)).toBeNull();
    expect(await db.listDocuments(result.awardId, bob.organization.id)).toEqual([]);

    // And Bob's own view stays empty.
    const dashboard = await getDashboardData(bob.organization.id);
    expect(dashboard.awards).toEqual([]);
  });

  it("refuses cross-organisation writes and deletes", async () => {
    const alice = await makeSession("alice@alpha.org", "Alpha");
    const bob = await makeSession("bob@beta.org", "Beta");

    const result = await ingestText(alice, SAMPLE_AWARD_TEXT, "Alpha grant");
    if (!result.ok) throw new Error("ingest failed");

    const obligations = await db.listObligations(result.awardId, alice.organization.id);
    const target = obligations[0];

    expect(
      await db.updateObligation(target.id, bob.organization.id, { reviewStatus: "confirmed" }),
    ).toBeNull();
    expect(await db.deleteObligation(target.id, bob.organization.id)).toBe(false);
    expect(await db.updateAward(result.awardId, bob.organization.id, { name: "hijacked" })).toBeNull();
    expect(await db.deleteAward(result.awardId, bob.organization.id)).toBe(false);

    // Alice's data is untouched.
    const after = await db.getAward(result.awardId, alice.organization.id);
    expect(after?.name).toBe("Alpha grant");
    expect(await db.getObligation(target.id, alice.organization.id)).not.toBeNull();
  });
});

describe("entitlements", () => {
  it("stops a free organisation after its first award", async () => {
    const session = await makeSession("owner@example.org", "Example Org");

    const first = await ingestText(session, SAMPLE_AWARD_TEXT, "First");
    expect(first.ok).toBe(true);

    const other = await fixture("03-cost-share-match.txt");
    const second = await ingestDocument({
      session,
      kind: "text",
      sourceType: "text",
      filename: "second.txt",
      mimeType: "text/plain",
      bytes: other,
      awardName: "Second",
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("entitlement");
  });

  it("allows a second award once a plan is active", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    await ingestText(session, SAMPLE_AWARD_TEXT, "First");
    await db.upsertSubscription(session.organization.id, { plan: "small_org", status: "active" });

    const other = await fixture("03-cost-share-match.txt");
    const second = await ingestDocument({
      session,
      kind: "text",
      sourceType: "text",
      filename: "second.txt",
      mimeType: "text/plain",
      bytes: other,
      awardName: "Second",
    });

    expect(second.ok).toBe(true);
  });
});

describe("exports", () => {
  it("produces a CSV, an ICS and a JSON export from real extracted data", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const workspace = await getAwardWorkspace(result.awardId, session.organization.id);
    if (!workspace) throw new Error("no workspace");

    const csv = obligationsToCsv(workspace.award, workspace.obligations);
    expect(csv).toContain("Title,Category,Description");
    expect(csv).toMatch(/must be verified against the award document/);

    // Nothing is confirmed yet, so the calendar is deliberately empty.
    const emptyIcs = obligationsToIcs(workspace.award, workspace.obligations, { stamp: "20260101T000000Z" });
    expect(emptyIcs).toContain("BEGIN:VCALENDAR");
    expect(emptyIcs).not.toContain("BEGIN:VEVENT");

    const dated = workspace.obligations.find((obligation) => obligation.dueDate);
    expect(dated, "the sample should yield at least one dated obligation").toBeDefined();
    await db.updateObligation(dated!.id, session.organization.id, { reviewStatus: "confirmed" });

    const confirmed = await attachCitations(
      await db.listObligations(result.awardId, session.organization.id),
    );
    const ics = obligationsToIcs(workspace.award, confirmed, { stamp: "20260101T000000Z" });
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);

    const json = buildJsonExport(workspace.award, confirmed, workspace.documents);
    expect(json.formatVersion).toBe(1);
    expect(json.obligations.length).toBe(confirmed.length);
    expect(json.disclaimer).toMatch(/does not provide legal/i);
    // Provenance survives the export.
    expect(json.obligations.some((o) => o.citations.some((c) => c.verified))).toBe(true);
  });
});

describe("reminders", () => {
  it("schedules reminders only for confirmed dated obligations, and is idempotent", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    await db.upsertSubscription(session.organization.id, { plan: "small_org", status: "active" });

    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const obligations = await db.listObligations(result.awardId, session.organization.id);
    const dated = obligations.find((obligation) => obligation.dueDate);
    if (!dated) throw new Error("expected a dated obligation");

    // Unconfirmed: no reminders.
    await syncRemindersForObligation(session, dated);
    expect(await db.listRemindersForObligation(dated.id)).toHaveLength(0);

    // Push the due date well into the future so offsets land ahead of today.
    const future = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
    const confirmed = await db.updateObligation(dated.id, session.organization.id, {
      reviewStatus: "confirmed",
      dueDate: future,
    });

    await syncRemindersForObligation(session, confirmed!);
    const scheduled = await db.listRemindersForObligation(dated.id);
    expect(scheduled.length).toBeGreaterThan(0);

    // Re-running must not duplicate.
    await syncRemindersForObligation(session, confirmed!);
    const again = await db.listRemindersForObligation(dated.id);
    expect(again).toHaveLength(scheduled.length);
    expect(new Set(again.map((r) => r.idempotencyKey)).size).toBe(again.length);
  });

  it("cancels a reminder whose obligation is no longer confirmed", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    await db.upsertSubscription(session.organization.id, { plan: "small_org", status: "active" });

    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const obligations = await db.listObligations(result.awardId, session.organization.id);
    const dated = obligations.find((obligation) => obligation.dueDate);
    if (!dated) throw new Error("expected a dated obligation");

    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const confirmed = await db.updateObligation(dated.id, session.organization.id, {
      reviewStatus: "confirmed",
      dueDate: soon,
    });
    await syncRemindersForObligation(session, confirmed!);
    expect((await db.listRemindersForObligation(dated.id)).length).toBeGreaterThan(0);

    // The user un-confirms it; the scheduled reminder must not fire.
    await db.updateObligation(dated.id, session.organization.id, { reviewStatus: "needs_review" });

    const summary = await processDueReminders(soon);
    expect(summary.sent).toBe(0);
    const after = await db.listRemindersForObligation(dated.id);
    expect(after.every((reminder) => reminder.status !== "sent")).toBe(true);
  });

  it("sends a due reminder exactly once across repeated runs", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    await db.upsertSubscription(session.organization.id, { plan: "small_org", status: "active" });

    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const obligations = await db.listObligations(result.awardId, session.organization.id);
    const dated = obligations.find((obligation) => obligation.dueDate);
    if (!dated) throw new Error("expected a dated obligation");

    const dueDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const confirmed = await db.updateObligation(dated.id, session.organization.id, {
      reviewStatus: "confirmed",
      dueDate,
    });
    await syncRemindersForObligation(session, confirmed!);

    const scheduled = await db.listRemindersForObligation(dated.id);
    const firstDue = scheduled.map((r) => r.scheduledFor).sort()[0];

    const first = await processDueReminders(firstDue);
    expect(first.sent).toBeGreaterThan(0);

    // A second run on the same day must not re-send.
    const second = await processDueReminders(firstDue);
    expect(second.sent).toBe(0);
  });
});

describe("deletion", () => {
  it("removes every trace of an organisation's data", async () => {
    const session = await makeSession("owner@example.org", "Example Org");
    const result = await ingestText(session, SAMPLE_AWARD_TEXT, "Sample grant");
    if (!result.ok) throw new Error("ingest failed");

    const documents = await db.listDocuments(result.awardId, session.organization.id);
    expect(await db.readDocumentBytes(documents[0].id)).not.toBeNull();

    await db.deleteOrganizationData(session.organization.id);

    expect(await db.listAwards(session.organization.id)).toEqual([]);
    expect(await db.listObligationsForOrganization(session.organization.id)).toEqual([]);
    expect(await db.listSegments(documents[0].id)).toEqual([]);
    // The stored bytes are gone from disk, not merely dereferenced.
    expect(await db.readDocumentBytes(documents[0].id)).toBeNull();
  });
});
