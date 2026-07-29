import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Parity and isolation tests for the Postgres adapter.
 *
 * Skipped unless `DATABASE_URL` points at a database with the migrations
 * applied. To run them:
 *
 *   export DATABASE_URL="$(./scripts/setup-test-db.sh awardlens_test)"
 *   npx vitest run tests/integration/postgres-adapter.test.ts
 *
 * The point of this file is not to re-test business logic — the file-backed
 * store already covers that. It is to prove the adapter behaves *identically*
 * where it matters, and above all that organisation scoping is enforced in the
 * SQL. A storage backend that returns another tenant's grant documents is the
 * single worst failure this product could have, so those assertions are written
 * as direct attacks with a valid session and someone else's ids.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeIfPostgres = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  console.info(
    "[postgres-adapter] DATABASE_URL not set — skipping. Run ./scripts/setup-test-db.sh to enable.",
  );
}

/**
 * The contract is the reference implementation's surface, not the adapter's own.
 * Typing against `local` is what makes "the adapter must behave identically"
 * a compile-time claim rather than a comment.
 */
type Store = typeof import("@/lib/db/local");

let db: Store;

describeIfPostgres("Postgres adapter", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db/postgres")) as Store;
  });

  afterAll(async () => {
    const { closeSql } = await import("@/lib/db/pg/client");
    await closeSql();
  });

  beforeEach(async () => {
    await db.__resetStore();
  });

  async function seedOrg(email: string, name: string) {
    const profile = await db.createProfile(email, null);
    const organization = await db.getOrCreateOrganizationForUser(profile.id, name);
    return { profile, organization };
  }

  async function seedAward(organizationId: string, createdBy: string, name: string) {
    return db.createAward({
      organizationId,
      name,
      funder: "Whitfield Family Foundation",
      recipientName: "Riverside Community Trust",
      awardNumber: "WFF-2026-014",
      awardAmount: 75000,
      currency: "USD",
      startDate: "2026-03-01",
      endDate: "2027-02-28",
      effectiveDate: "2026-03-01",
      grantPeriodText: "March 1, 2026 through February 28, 2027",
      programName: null,
      assistanceType: null,
      primaryContacts: [],
      governingDocuments: ["2 CFR Part 200"],
      status: "active",
      reviewStatus: "not_started",
      sourceType: "text",
      createdBy,
    });
  }

  describe("identity", () => {
    it("creates a profile and exactly one organisation for a new user", async () => {
      const { profile, organization } = await seedOrg("owner@example.org", "Example Org");

      expect(profile.email).toBe("owner@example.org");
      expect(await db.getProfile(profile.id)).toMatchObject({ id: profile.id });
      expect(await db.findProfileByEmail("OWNER@EXAMPLE.ORG")).toMatchObject({ id: profile.id });

      // Calling again must return the same organisation, not create a second.
      const again = await db.getOrCreateOrganizationForUser(profile.id, "Example Org");
      expect(again.id).toBe(organization.id);
      expect(await db.isMember(organization.id, profile.id)).toBe(true);
    });

    it("gives two organisations with the same name distinct slugs", async () => {
      const a = await seedOrg("a@alpha.org", "Riverside");
      const b = await seedOrg("b@beta.org", "Riverside");
      expect(a.organization.slug).not.toBe(b.organization.slug);
    });

    it("consumes a login code once and enforces expiry and attempts", async () => {
      await db.saveLoginCode("user@example.org", "hash-a", futureIso(15));
      expect(await db.consumeLoginCode("user@example.org", "hash-a")).toBe("ok");
      // Single use.
      expect(await db.consumeLoginCode("user@example.org", "hash-a")).toBe("invalid");

      await db.saveLoginCode("user@example.org", "hash-b", futureIso(-1));
      expect(await db.consumeLoginCode("user@example.org", "hash-b")).toBe("expired");

      await db.saveLoginCode("user@example.org", "hash-c", futureIso(15));
      for (let i = 0; i < 5; i += 1) {
        expect(await db.consumeLoginCode("user@example.org", "wrong")).toBe("invalid");
      }
      expect(await db.consumeLoginCode("user@example.org", "hash-c")).toBe("too_many_attempts");
    });
  });

  describe("organisation isolation", () => {
    it("never returns another organisation's award, document, segment or obligation", async () => {
      const alice = await seedOrg("alice@alpha.org", "Alpha");
      const bob = await seedOrg("bob@beta.org", "Beta");
      expect(alice.organization.id).not.toBe(bob.organization.id);

      const award = await seedAward(
        alice.organization.id,
        alice.profile.id,
        "Alpha operating grant",
      );

      const document = await db.createDocument({
        awardId: award.id,
        organizationId: alice.organization.id,
        storagePath: null,
        originalFilename: "grant.txt",
        mimeType: "text/plain",
        byteSize: 42,
        contentHash: "hash-alpha",
        parserStatus: "parsed",
        parserMessage: null,
        pageCount: 5,
        extractedTextVersion: "1",
      });

      await db.createSegments(document.id, [
        {
          locatorType: "page",
          locatorValue: "1",
          heading: null,
          text: "The Recipient shall submit an annual report.",
          sequence: 0,
          tokenEstimate: 12,
        },
      ]);

      const [obligation] = await db.createObligations(
        [
          {
            awardId: award.id,
            organizationId: alice.organization.id,
            category: "reporting",
            title: "Annual report",
            description: "Submit an annual report.",
            originalDateText: null,
            dueDate: "2027-04-30",
            recurrence: "annual",
            internalDueDate: "2027-04-09",
            suggestedOwnerRole: "Grants manager",
            assignedUserId: null,
            priority: "high",
            confidence: 0.85,
            reviewStatus: "needs_review",
            interpretationLevel: "explicit",
            consequence: null,
            clarificationQuestion: null,
            sourceStatus: "verified",
            notes: null,
            dateConflicts: [],
            origin: "extracted",
          },
        ],
        () => [],
      );

      // ---- Reads with a valid session but the wrong organisation ----------
      expect(await db.getAward(award.id, bob.organization.id)).toBeNull();
      expect(await db.listAwards(bob.organization.id)).toEqual([]);
      expect(await db.getDocument(document.id, bob.organization.id)).toBeNull();
      expect(await db.listDocuments(award.id, bob.organization.id)).toEqual([]);
      expect(await db.listObligations(award.id, bob.organization.id)).toEqual([]);
      expect(await db.listObligationsForOrganization(bob.organization.id)).toEqual([]);
      expect(await db.getObligation(obligation.id, bob.organization.id)).toBeNull();
      expect(
        await db.findAwardByContentHash(bob.organization.id, "hash-alpha"),
      ).toBeNull();

      // ---- Writes and deletes -------------------------------------------
      expect(await db.updateAward(award.id, bob.organization.id, { name: "hijacked" })).toBeNull();
      expect(
        await db.updateObligation(obligation.id, bob.organization.id, {
          reviewStatus: "confirmed",
        }),
      ).toBeNull();
      expect(await db.deleteObligation(obligation.id, bob.organization.id)).toBe(false);
      expect(await db.deleteDocument(document.id, bob.organization.id)).toBe(false);
      expect(await db.deleteAward(award.id, bob.organization.id)).toBe(false);

      // ---- Alice's data is untouched -------------------------------------
      const survived = await db.getAward(award.id, alice.organization.id);
      expect(survived?.name).toBe("Alpha operating grant");
      expect(await db.getObligation(obligation.id, alice.organization.id)).not.toBeNull();
    });

    it("cannot be tricked into moving a row between organisations via a patch", async () => {
      const alice = await seedOrg("alice@alpha.org", "Alpha");
      const bob = await seedOrg("bob@beta.org", "Beta");
      const award = await seedAward(alice.organization.id, alice.profile.id, "Alpha grant");

      await db.updateAward(award.id, alice.organization.id, {
        // A hostile patch attempting to reassign ownership.
        organizationId: bob.organization.id,
        id: "00000000-0000-0000-0000-000000000000",
      } as Parameters<typeof db.updateAward>[2]);

      // The award must still belong to Alice, under its original id.
      expect(await db.getAward(award.id, bob.organization.id)).toBeNull();
      expect(await db.getAward(award.id, alice.organization.id)).not.toBeNull();
    });
  });

  describe("round-trip fidelity", () => {
    it("preserves award types across a write and read", async () => {
      const { profile, organization } = await seedOrg("owner@example.org", "Example Org");
      const created = await seedAward(organization.id, profile.id, "Typed award");
      const read = await db.getAward(created.id, organization.id);

      expect(read).not.toBeNull();
      // Dates stay as plain ISO date strings, never Date objects or timestamps.
      expect(read?.startDate).toBe("2026-03-01");
      expect(read?.endDate).toBe("2027-02-28");
      // numeric arrives as a string from Postgres and must be converted.
      expect(read?.awardAmount).toBe(75000);
      expect(typeof read?.awardAmount).toBe("number");
      // jsonb round-trips as a real array.
      expect(read?.governingDocuments).toEqual(["2 CFR Part 200"]);
      expect(Array.isArray(read?.primaryContacts)).toBe(true);
      expect(read?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("stores and returns document bytes", async () => {
      const { profile, organization } = await seedOrg("owner@example.org", "Example Org");
      const award = await seedAward(organization.id, profile.id, "Award");
      const document = await db.createDocument({
        awardId: award.id,
        organizationId: organization.id,
        storagePath: null,
        originalFilename: "grant.pdf",
        mimeType: "application/pdf",
        byteSize: 5,
        contentHash: "hash-bytes",
        parserStatus: "parsed",
        parserMessage: null,
        pageCount: 1,
        extractedTextVersion: "1",
      });

      const payload = Buffer.from("hello");
      await db.saveDocumentBytes(document.id, payload);
      const read = await db.readDocumentBytes(document.id);
      expect(read).not.toBeNull();
      expect(Buffer.compare(read as Buffer, payload)).toBe(0);
    });
  });

  describe("webhook idempotency", () => {
    it("claims a Stripe event exactly once", async () => {
      expect(await db.claimStripeEvent("evt_test_1")).toBe(true);
      expect(await db.claimStripeEvent("evt_test_1")).toBe(false);
      expect(await db.claimStripeEvent("evt_test_2")).toBe(true);
    });
  });

  describe("notification preferences", () => {
    it("returns defaults without inserting a row", async () => {
      const { profile, organization } = await seedOrg("owner@example.org", "Example Org");
      const preferences = await db.getNotificationPreferences(profile.id, organization.id);

      expect(preferences.enabled).toBe(true);
      expect(preferences.offsets).toEqual([30, 14, 7, 1]);

      // Reading must not have created anything; the second read is identical.
      const again = await db.getNotificationPreferences(profile.id, organization.id);
      expect(again.offsets).toEqual([30, 14, 7, 1]);
    });
  });

  describe("account deletion", () => {
    it("removes an organisation's awards, documents and obligations", async () => {
      const { profile, organization } = await seedOrg("owner@example.org", "Example Org");
      const award = await seedAward(organization.id, profile.id, "Award");
      const document = await db.createDocument({
        awardId: award.id,
        organizationId: organization.id,
        storagePath: null,
        originalFilename: "grant.txt",
        mimeType: "text/plain",
        byteSize: 3,
        contentHash: "hash-del",
        parserStatus: "parsed",
        parserMessage: null,
        pageCount: 1,
        extractedTextVersion: "1",
      });
      await db.saveDocumentBytes(document.id, Buffer.from("abc"));

      await db.deleteOrganizationData(organization.id);

      expect(await db.listAwards(organization.id)).toEqual([]);
      expect(await db.listObligationsForOrganization(organization.id)).toEqual([]);
      expect(await db.readDocumentBytes(document.id)).toBeNull();
    });
  });
});

function futureIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
