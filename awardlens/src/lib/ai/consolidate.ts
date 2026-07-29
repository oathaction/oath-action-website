import type { DateConflict, LocatorType, ObligationCategory } from "@/lib/domain/types";
import type { ObligationCandidate } from "./schemas";
import type { ResolvedCitation } from "./citations";

/**
 * Consolidation (pipeline stage 5).
 *
 * This is deliberately deterministic rather than another model call. Merging is
 * a mechanical judgement — same category, near-identical wording — and doing it
 * in code makes it reproducible, free, testable, and incapable of inventing a
 * requirement that no pass actually extracted.
 *
 * The one thing it must never do is quietly resolve a contradiction. When two
 * merged candidates give different due dates for the same requirement, both
 * dates survive on the merged obligation as a conflict for the user to settle.
 */

export interface CandidateWithEvidence {
  candidate: ObligationCandidate;
  citations: ResolvedCitation[];
  origin: "extracted" | "critic";
}

export interface ConsolidatedObligation {
  category: ObligationCategory;
  title: string;
  description: string;
  originalDateText: string | null;
  dueDate: string | null;
  recurrence: string | null;
  suggestedInternalLeadDays: number | null;
  suggestedOwnerRole: string | null;
  priority: ObligationCandidate["priority"];
  confidence: number;
  interpretationLevel: ObligationCandidate["interpretationLevel"];
  consequence: string | null;
  clarificationQuestion: string | null;
  citations: ResolvedCitation[];
  dateConflicts: DateConflict[];
  origin: "extracted" | "critic";
  mergedCount: number;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "for", "to", "and", "or", "in", "on", "at", "by", "with",
  "must", "shall", "will", "be", "is", "are", "any", "all", "each", "this", "that",
  "recipient", "grantee", "organization", "organisation", "award", "grant", "funder",
]);

export function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

/** Jaccard similarity over content words. */
export function similarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Two candidates are the same obligation when they share a category and BOTH
 * their titles and their substance agree.
 *
 * Requiring the description to agree as well as the title is deliberate.
 * Titles are short and often generic — "Closeout requirement", "Annual report"
 * — so title similarity alone merges genuinely different duties: a narrative
 * report and a financial report, or two unrelated closeout terms. That is not
 * merely untidy. A wrong merge collapses two real deadlines into one and, when
 * their dates differ, the result looks like a contradiction in the document and
 * suppresses both dates. Under-merging shows the user a duplicate they can
 * dismiss; over-merging silently loses a deadline.
 *
 * Differing recurrence is a hard separator — a quarterly report and an annual
 * report are never the same duty however similar the words.
 */
export function isSameObligation(a: ObligationCandidate, b: ObligationCandidate): boolean {
  if (a.category !== b.category) return false;

  const aRecurrence = (a.recurrence ?? "").toLowerCase().trim();
  const bRecurrence = (b.recurrence ?? "").toLowerCase().trim();
  if (aRecurrence && bRecurrence && aRecurrence !== bRecurrence) return false;

  const titleScore = similarity(a.title, b.title);
  const bodyScore = similarity(a.description, b.description);

  // Near-identical titles still need the underlying requirement to match.
  if (titleScore >= 0.85 && bodyScore >= 0.45) return true;
  // A looser title match needs strong agreement in the substance.
  if (titleScore >= 0.55 && bodyScore >= 0.65) return true;
  return false;
}

function pickLonger(a: string, b: string): string {
  return b.length > a.length ? b : a;
}

function dedupeCitations(citations: ResolvedCitation[]): ResolvedCitation[] {
  const seen = new Set<string>();
  const result: ResolvedCitation[] = [];
  for (const citation of citations) {
    const key = `${citation.segmentId ?? "none"}|${citation.excerpt.slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(citation);
  }
  return result.sort((a, b) => b.matchScore - a.matchScore).slice(0, 6);
}

function mergeGroup(group: CandidateWithEvidence[]): ConsolidatedObligation {
  // Anchor on the best-evidenced, most confident candidate.
  const ranked = [...group].sort((a, b) => {
    const aScore = Math.max(0, ...a.citations.map((citation) => citation.matchScore));
    const bScore = Math.max(0, ...b.citations.map((citation) => citation.matchScore));
    if (bScore !== aScore) return bScore - aScore;
    return b.candidate.confidence - a.candidate.confidence;
  });

  const primary = ranked[0].candidate;
  const allCitations = dedupeCitations(group.flatMap((entry) => entry.citations));

  // Every distinct stated date survives. If more than one remains, the
  // obligation carries an unresolved conflict rather than a silent winner.
  const datedEntries = group.filter((entry) => entry.candidate.normalizedDueDate);
  const distinctDates = [
    ...new Set(datedEntries.map((entry) => entry.candidate.normalizedDueDate as string)),
  ];

  const dateConflicts: DateConflict[] =
    distinctDates.length > 1
      ? datedEntries.map((entry) => {
          const citation = entry.citations.find((item) => item.segmentId) ?? entry.citations[0];
          return {
            dateText: entry.candidate.originalDateText ?? (entry.candidate.normalizedDueDate as string),
            normalizedDate: entry.candidate.normalizedDueDate,
            locatorType: (citation?.locatorType ?? "paragraph") as LocatorType,
            locatorValue: citation?.locatorValue ?? "",
          };
        })
      : [];

  const priorityOrder = ["critical", "high", "medium", "low"] as const;
  const priority = priorityOrder.find((level) =>
    group.some((entry) => entry.candidate.priority === level),
  )!;

  const interpretationOrder = ["uncertain", "light_interpretation", "explicit"] as const;
  // A merged obligation is only as explicit as its weakest contributing claim.
  const interpretationLevel = interpretationOrder.find((level) =>
    group.some((entry) => entry.candidate.interpretationLevel === level),
  )!;

  const description = group.reduce(
    (best, entry) => pickLonger(best, entry.candidate.description),
    primary.description,
  );

  return {
    category: primary.category,
    title: primary.title,
    description,
    originalDateText:
      group.find((entry) => entry.candidate.originalDateText)?.candidate.originalDateText ?? null,
    // With a conflict we deliberately store no due date until a human resolves it.
    dueDate: distinctDates.length === 1 ? distinctDates[0] : null,
    recurrence: group.find((entry) => entry.candidate.recurrence)?.candidate.recurrence ?? null,
    suggestedInternalLeadDays:
      group.find((entry) => entry.candidate.suggestedInternalLeadDays !== null)?.candidate
        .suggestedInternalLeadDays ?? null,
    suggestedOwnerRole:
      group.find((entry) => entry.candidate.suggestedOwnerRole)?.candidate.suggestedOwnerRole ?? null,
    priority,
    // Corroboration across passes raises confidence, but never to certainty.
    confidence: Math.min(
      0.98,
      Math.max(...group.map((entry) => entry.candidate.confidence)) +
        (group.length > 1 ? 0.05 : 0),
    ),
    interpretationLevel,
    consequence: group.find((entry) => entry.candidate.consequence)?.candidate.consequence ?? null,
    clarificationQuestion:
      distinctDates.length > 1
        ? `The document gives more than one due date for this requirement (${distinctDates.join(" and ")}). Which date applies?`
        : (group.find((entry) => entry.candidate.clarificationQuestion)?.candidate
            .clarificationQuestion ?? null),
    citations: allCitations,
    dateConflicts,
    origin: group.every((entry) => entry.origin === "critic") ? "critic" : "extracted",
    mergedCount: group.length,
  };
}

export function consolidateCandidates(
  entries: CandidateWithEvidence[],
): ConsolidatedObligation[] {
  const groups: CandidateWithEvidence[][] = [];

  for (const entry of entries) {
    const existing = groups.find((group) =>
      group.some((member) => isSameObligation(member.candidate, entry.candidate)),
    );
    if (existing) existing.push(entry);
    else groups.push([entry]);
  }

  return groups.map(mergeGroup);
}
