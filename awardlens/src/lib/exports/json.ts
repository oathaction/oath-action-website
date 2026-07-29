import type { Award, DocumentRecord, ObligationWithCitations } from "@/lib/domain/types";

/**
 * Portable JSON export.
 *
 * Deliberately self-describing: it carries the review state, the confidence and
 * the provenance of every item, so an organisation leaving AwardLens keeps the
 * information that makes the register trustworthy rather than a bare list of
 * dates. It contains no document bytes and no internal ids beyond what is needed
 * to relate obligations to their citations.
 */
export interface JsonExport {
  formatVersion: 1;
  generatedAt: string;
  disclaimer: string;
  award: {
    name: string;
    funder: string | null;
    recipientName: string | null;
    awardNumber: string | null;
    awardAmount: number | null;
    currency: string;
    startDate: string | null;
    endDate: string | null;
    grantPeriodText: string | null;
    programName: string | null;
    assistanceType: string | null;
    governingDocuments: string[];
    reviewStatus: string;
  };
  documents: {
    filename: string;
    mimeType: string;
    pageCount: number | null;
    contentHash: string;
    parserStatus: string;
  }[];
  obligations: {
    id: string;
    category: string;
    title: string;
    description: string;
    dueDate: string | null;
    originalDateText: string | null;
    recurrence: string | null;
    internalDueDate: string | null;
    suggestedOwnerRole: string | null;
    priority: string;
    reviewStatus: string;
    confidence: number;
    interpretationLevel: string;
    sourceStatus: string;
    origin: string;
    consequence: string | null;
    clarificationQuestion: string | null;
    notes: string | null;
    dateConflicts: unknown[];
    citations: {
      locatorType: string;
      locatorValue: string;
      excerpt: string;
      matchScore: number;
      verified: boolean;
    }[];
  }[];
}

export function buildJsonExport(
  award: Award,
  obligations: ObligationWithCitations[],
  documents: DocumentRecord[],
  generatedAt = new Date().toISOString(),
): JsonExport {
  return {
    formatVersion: 1,
    generatedAt,
    disclaimer:
      "Extracted by AwardLens from the source documents listed. Items marked reviewStatus 'needs_review' have not been verified by a person. AwardLens does not provide legal, accounting, tax or compliance advice and cannot guarantee that every requirement was found.",
    award: {
      name: award.name,
      funder: award.funder,
      recipientName: award.recipientName,
      awardNumber: award.awardNumber,
      awardAmount: award.awardAmount,
      currency: award.currency,
      startDate: award.startDate,
      endDate: award.endDate,
      grantPeriodText: award.grantPeriodText,
      programName: award.programName,
      assistanceType: award.assistanceType,
      governingDocuments: award.governingDocuments,
      reviewStatus: award.reviewStatus,
    },
    documents: documents.map((document) => ({
      filename: document.originalFilename,
      mimeType: document.mimeType,
      pageCount: document.pageCount,
      contentHash: document.contentHash,
      parserStatus: document.parserStatus,
    })),
    obligations: obligations.map((obligation) => ({
      id: obligation.id,
      category: obligation.category,
      title: obligation.title,
      description: obligation.description,
      dueDate: obligation.dueDate,
      originalDateText: obligation.originalDateText,
      recurrence: obligation.recurrence,
      internalDueDate: obligation.internalDueDate,
      suggestedOwnerRole: obligation.suggestedOwnerRole,
      priority: obligation.priority,
      reviewStatus: obligation.reviewStatus,
      confidence: obligation.confidence,
      interpretationLevel: obligation.interpretationLevel,
      sourceStatus: obligation.sourceStatus,
      origin: obligation.origin,
      consequence: obligation.consequence,
      clarificationQuestion: obligation.clarificationQuestion,
      notes: obligation.notes,
      dateConflicts: obligation.dateConflicts,
      citations: obligation.citations.map((citation) => ({
        locatorType: citation.locatorType,
        locatorValue: citation.locatorValue,
        excerpt: citation.excerpt,
        matchScore: citation.matchScore,
        verified: citation.documentSegmentId !== null,
      })),
    })),
  };
}
