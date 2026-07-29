import "server-only";

import type {
  Award,
  DocumentRecord,
  ObligationWithCitations,
  ProcessingRun,
} from "@/lib/domain/types";
import { daysUntil } from "@/lib/utils";
import * as db from "@/lib/db/local";

/** Joins obligations to their citations in one pass rather than per row. */
export async function attachCitations(
  obligations: Awaited<ReturnType<typeof db.listObligations>>,
): Promise<ObligationWithCitations[]> {
  const citations = await db.listCitations(obligations.map((obligation) => obligation.id));
  const byObligation = new Map<string, typeof citations>();
  for (const citation of citations) {
    const bucket = byObligation.get(citation.obligationId);
    if (bucket) bucket.push(citation);
    else byObligation.set(citation.obligationId, [citation]);
  }
  return obligations.map((obligation) => ({
    ...obligation,
    citations: (byObligation.get(obligation.id) ?? []).sort(
      (a, b) => b.matchScore - a.matchScore,
    ),
  }));
}

export interface AwardWorkspace {
  award: Award;
  obligations: ObligationWithCitations[];
  documents: DocumentRecord[];
  latestRun: ProcessingRun | null;
  progress: ReviewProgress;
}

export interface ReviewProgress {
  total: number;
  confirmed: number;
  needsReview: number;
  needsClarification: number;
  notApplicable: number;
  unverifiedSource: number;
  percentComplete: number;
}

export function summariseReview(obligations: ObligationWithCitations[]): ReviewProgress {
  const active = obligations.filter((obligation) => obligation.reviewStatus !== "archived");
  const confirmed = active.filter((o) => o.reviewStatus === "confirmed").length;
  const needsReview = active.filter((o) => o.reviewStatus === "needs_review").length;
  const needsClarification = active.filter((o) => o.reviewStatus === "needs_clarification").length;
  const notApplicable = active.filter((o) => o.reviewStatus === "not_applicable").length;
  const unverifiedSource = active.filter((o) => o.sourceStatus === "unverified").length;
  // "Reviewed" means a person has made a decision — including deciding it does not apply.
  const decided = confirmed + notApplicable + needsClarification;

  return {
    total: active.length,
    confirmed,
    needsReview,
    needsClarification,
    notApplicable,
    unverifiedSource,
    percentComplete: active.length === 0 ? 0 : Math.round((decided / active.length) * 100),
  };
}

export async function getAwardWorkspace(
  awardId: string,
  organizationId: string,
): Promise<AwardWorkspace | null> {
  const award = await db.getAward(awardId, organizationId);
  if (!award) return null;

  const [rawObligations, documents, latestRun] = await Promise.all([
    db.listObligations(awardId, organizationId),
    db.listDocuments(awardId, organizationId),
    db.getLatestRun(awardId),
  ]);

  const obligations = await attachCitations(rawObligations);
  return { award, obligations, documents, latestRun, progress: summariseReview(obligations) };
}

export interface DeadlineEntry {
  obligation: ObligationWithCitations;
  award: Award;
  daysAway: number;
}

export interface DashboardData {
  awards: Award[];
  activeAwards: Award[];
  dueIn30: DeadlineEntry[];
  dueIn60: DeadlineEntry[];
  dueIn90: DeadlineEntry[];
  overdue: DeadlineEntry[];
  awaitingReview: number;
  openQuestions: { obligation: ObligationWithCitations; award: Award }[];
  recentAwards: Award[];
  unverifiedSources: number;
}

/**
 * Dashboard aggregation.
 *
 * Deadline buckets deliberately include unconfirmed items — an unreviewed
 * deadline is exactly the thing a user needs to be told about — but each entry
 * carries its obligation so the UI can label review state honestly.
 */
export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const awards = await db.listAwards(organizationId);
  const rawObligations = await db.listObligationsForOrganization(organizationId);
  const obligations = await attachCitations(rawObligations);

  const awardById = new Map(awards.map((award) => [award.id, award]));
  const dated: DeadlineEntry[] = [];
  let awaitingReview = 0;
  let unverifiedSources = 0;
  const openQuestions: DashboardData["openQuestions"] = [];

  for (const obligation of obligations) {
    const award = awardById.get(obligation.awardId);
    if (!award) continue;
    if (obligation.reviewStatus === "archived" || obligation.reviewStatus === "not_applicable") {
      continue;
    }

    if (obligation.reviewStatus === "needs_review") awaitingReview += 1;
    if (obligation.sourceStatus === "unverified") unverifiedSources += 1;
    if (obligation.clarificationQuestion && obligation.reviewStatus !== "confirmed") {
      openQuestions.push({ obligation, award });
    }

    const days = daysUntil(obligation.dueDate);
    if (days !== null) dated.push({ obligation, award, daysAway: days });
  }

  dated.sort((a, b) => a.daysAway - b.daysAway);

  return {
    awards,
    activeAwards: awards.filter((award) => award.status === "active"),
    overdue: dated.filter((entry) => entry.daysAway < 0),
    dueIn30: dated.filter((entry) => entry.daysAway >= 0 && entry.daysAway <= 30),
    dueIn60: dated.filter((entry) => entry.daysAway > 30 && entry.daysAway <= 60),
    dueIn90: dated.filter((entry) => entry.daysAway > 60 && entry.daysAway <= 90),
    awaitingReview,
    openQuestions: openQuestions.slice(0, 8),
    recentAwards: awards.slice(0, 5),
    unverifiedSources,
  };
}
