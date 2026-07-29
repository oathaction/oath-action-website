import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ResolvedCitation } from "@/lib/ai/citations";
import type { ObligationCandidate } from "@/lib/ai/schemas";
import type { SegmentInput } from "@/lib/documents/segment";
import { estimateTokens } from "@/lib/documents/segment";
import type {
  Award,
  ObligationCitation,
  ObligationWithCitations,
  Subscription,
} from "@/lib/domain/types";

/**
 * Small builders so each test can state only the field it is actually asserting
 * on. Nothing here has behaviour — they exist to keep the tests readable.
 */

const FIXTURE_DIR = resolve(__dirname, "../../fixtures");

export function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf8");
}

export function makeSegment(overrides: Partial<SegmentInput> & { text: string }): SegmentInput {
  const text = overrides.text;
  return {
    id: "s1",
    locatorType: "page",
    locatorValue: "1",
    heading: null,
    sequence: 0,
    tokenEstimate: estimateTokens(text),
    ...overrides,
  };
}

export function makeAward(overrides: Partial<Award> = {}): Award {
  return {
    id: "award-1",
    organizationId: "org-1",
    name: "Community Housing Grant",
    funder: "Whitfield Family Foundation",
    recipientName: "Riverbend Community Housing Trust, Inc.",
    awardNumber: "WFF-2026-0417",
    awardAmount: 75000,
    currency: "USD",
    startDate: "2026-03-01",
    endDate: "2027-02-28",
    effectiveDate: "2026-03-01",
    grantPeriodText: "March 1, 2026 through February 28, 2027",
    programName: null,
    assistanceType: null,
    primaryContacts: [],
    governingDocuments: [],
    status: "active",
    reviewStatus: "in_progress",
    sourceType: "text",
    createdBy: "user-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeStoredCitation(
  overrides: Partial<ObligationCitation> = {},
): ObligationCitation {
  return {
    id: "cit-1",
    obligationId: "ob-1",
    documentSegmentId: "seg-1",
    locatorType: "page",
    locatorValue: "3",
    excerpt: "The Grantee shall submit a single annual report to the Foundation.",
    startOffset: 0,
    endOffset: 65,
    matchScore: 1,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeObligation(
  overrides: Partial<ObligationWithCitations> = {},
): ObligationWithCitations {
  return {
    id: "ob-1",
    awardId: "award-1",
    organizationId: "org-1",
    category: "reporting",
    title: "Annual report",
    description: "Submit a single annual report covering the grant period.",
    originalDateText: "no later than April 30, 2027",
    dueDate: "2027-04-30",
    recurrence: null,
    internalDueDate: "2027-04-09",
    suggestedOwnerRole: "Grants manager",
    assignedUserId: null,
    priority: "high",
    confidence: 0.88,
    reviewStatus: "confirmed",
    interpretationLevel: "explicit",
    consequence: null,
    clarificationQuestion: null,
    sourceStatus: "verified",
    notes: null,
    dateConflicts: [],
    origin: "extracted",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    citations: [makeStoredCitation()],
    ...overrides,
  };
}

export function makeCandidate(overrides: Partial<ObligationCandidate> = {}): ObligationCandidate {
  return {
    category: "reporting",
    title: "Annual narrative report",
    description: "The award states: the Grantee shall submit an annual narrative report.",
    originalDateText: "no later than April 30, 2027",
    normalizedDueDate: "2027-04-30",
    recurrence: null,
    suggestedInternalLeadDays: 21,
    suggestedOwnerRole: "Grants manager",
    priority: "high",
    confidence: 0.85,
    interpretationLevel: "explicit",
    consequence: null,
    clarificationQuestion: null,
    citations: [
      {
        segmentId: "s1",
        locatorType: "page",
        locatorValue: "3",
        excerpt: "The Grantee shall submit an annual narrative report.",
      },
    ],
    ...overrides,
  };
}

export function makeResolvedCitation(
  overrides: Partial<ResolvedCitation> = {},
): ResolvedCitation {
  return {
    segmentId: "s1",
    locatorType: "page",
    locatorValue: "3",
    excerpt: "The Grantee shall submit an annual narrative report.",
    startOffset: 0,
    endOffset: 51,
    matchScore: 1,
    ...overrides,
  };
}

export function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    organizationId: "org-1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    plan: "small_org",
    status: "active",
    periodEnd: "2026-12-31",
    awardCredits: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
