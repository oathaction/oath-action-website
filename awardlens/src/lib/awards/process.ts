import "server-only";

import type {
  Award,
  AwardSourceType,
  Obligation,
  ObligationCitation,
  ProcessingStage,
} from "@/lib/domain/types";
import { computeInternalDueDate } from "@/lib/domain/dates";
import type { AcceptedKind } from "@/lib/documents/validation";
import { hashContent } from "@/lib/documents/validation";
import { parseDocument } from "@/lib/documents/parse";
import { segmentBlocks, type SegmentInput } from "@/lib/documents/segment";
import { runExtraction } from "@/lib/ai/pipeline";
import * as db from "@/lib/db/local";
import type { Session } from "@/lib/auth";
import { checkAwardEntitlement } from "@/lib/billing/plans";

export interface IngestInput {
  session: Session;
  kind: AcceptedKind;
  sourceType: AwardSourceType;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  awardName: string | null;
}

export type IngestFailure = {
  code:
    | "entitlement"
    | "parse_failed"
    | "no_text"
    | "password_protected"
    | "corrupted"
    | "extraction_failed";
  message: string;
  /** Set when a partially usable award record exists to return to. */
  awardId?: string;
};

export type IngestResult =
  | { ok: true; awardId: string; duplicate: boolean; obligationCount: number; warnings: string[] }
  | { ok: false; error: IngestFailure };

export interface IngestOptions {
  onStage?: (stage: ProcessingStage) => void | Promise<void>;
}

function defaultAwardName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.length > 2 ? base.slice(0, 90) : "Untitled award";
}

/**
 * The full upload-to-review pipeline.
 *
 * Ordering matters for failure behaviour: the document is stored and parsed
 * before any model call, so a parse failure costs nothing and a model failure
 * still leaves the user with a stored document and a retryable award rather
 * than nothing.
 */
export async function ingestDocument(
  input: IngestInput,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const { session } = input;
  const organizationId = session.organization.id;

  await options.onStage?.("securing_document");

  const contentHash = hashContent(input.bytes);

  // Idempotency: re-uploading the same bytes returns the original award rather
  // than creating a duplicate and paying for a second extraction.
  const existing = await db.findAwardByContentHash(organizationId, contentHash);
  if (existing) {
    const obligations = await db.listObligations(existing.award.id, organizationId);
    return {
      ok: true,
      awardId: existing.award.id,
      duplicate: true,
      obligationCount: obligations.length,
      warnings: [],
    };
  }

  const [subscription, awards] = await Promise.all([
    db.getSubscription(organizationId),
    db.listAwards(organizationId),
  ]);
  const entitlement = checkAwardEntitlement(subscription, awards.length);
  if (!entitlement.allowed) {
    return {
      ok: false,
      error: { code: "entitlement", message: entitlement.reason ?? "Plan limit reached." },
    };
  }

  const award = await db.createAward({
    organizationId,
    name: input.awardName?.trim() || defaultAwardName(input.filename),
    funder: null,
    recipientName: null,
    awardNumber: null,
    awardAmount: null,
    currency: "USD",
    startDate: null,
    endDate: null,
    effectiveDate: null,
    grantPeriodText: null,
    programName: null,
    assistanceType: null,
    primaryContacts: [],
    governingDocuments: [],
    status: "processing",
    reviewStatus: "not_started",
    sourceType: input.sourceType,
    createdBy: session.profile.id,
  });

  const document = await db.createDocument({
    awardId: award.id,
    organizationId,
    storagePath: null,
    originalFilename: input.filename,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    contentHash,
    parserStatus: "pending",
    parserMessage: null,
    pageCount: null,
    extractedTextVersion: "1",
  });

  const storagePath = await db.saveDocumentBytes(document.id, input.bytes);
  await db.updateDocument(document.id, organizationId, { storagePath });

  await options.onStage?.("reading_document");

  const parsed = await parseDocument(input.kind, input.bytes);
  await db.updateDocument(document.id, organizationId, {
    parserStatus: parsed.status,
    parserMessage: parsed.message,
    pageCount: parsed.pageCount,
  });

  if (parsed.status !== "parsed" || parsed.blocks.length === 0) {
    await db.updateAward(award.id, organizationId, { status: "failed" });
    const code =
      parsed.status === "password_protected"
        ? "password_protected"
        : parsed.status === "corrupted"
          ? "corrupted"
          : parsed.status === "no_text_layer"
            ? "no_text"
            : "parse_failed";
    return {
      ok: false,
      error: {
        code,
        message: parsed.message ?? "This document could not be read.",
        awardId: award.id,
      },
    };
  }

  const segments = segmentBlocks(parsed.blocks);
  const storedSegments = await db.createSegments(
    document.id,
    segments.map((segment) => ({
      locatorType: segment.locatorType,
      locatorValue: segment.locatorValue,
      heading: segment.heading,
      text: segment.text,
      sequence: segment.sequence,
      tokenEstimate: segment.tokenEstimate,
    })),
  );

  // Extraction cites by the stored segment id so citations survive a reload.
  const pipelineSegments = storedSegments.map((segment) => ({
    id: segment.id,
    locatorType: segment.locatorType,
    locatorValue: segment.locatorValue,
    heading: segment.heading,
    text: segment.text,
    sequence: segment.sequence,
    tokenEstimate: segment.tokenEstimate,
  }));

  const run = await db.createRun({
    awardId: award.id,
    documentId: document.id,
    status: "running",
    stage: "identifying_award",
    model: null,
    promptVersion: "",
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    usageMetadata: null,
  });

  return extractIntoAward({
    session,
    award,
    runId: run.id,
    segments: pipelineSegments,
    awardNameOverride: input.awardName?.trim() || null,
    onStage: options.onStage,
  });
}

interface ExtractIntoAwardInput {
  session: Session;
  award: Award;
  runId: string;
  segments: SegmentInput[];
  awardNameOverride: string | null;
  onStage?: (stage: ProcessingStage) => void | Promise<void>;
}

/**
 * Runs the extraction pipeline over already-stored segments and persists the
 * result onto an existing award. Shared by first ingestion and re-analysis so
 * both paths behave identically.
 */
export async function extractIntoAward(input: ExtractIntoAwardInput): Promise<IngestResult> {
  const { session, award, runId, segments } = input;
  const organizationId = session.organization.id;

  try {
    const extraction = await runExtraction({
      segments,
      onStage: async (stage) => {
        await db.updateRun(runId, { stage });
        await input.onStage?.(stage);
      },
    });

    const profile = extraction.profile;
    await db.updateAward(award.id, organizationId, {
      name: input.awardNameOverride || profile.awardName || award.name,
      funder: profile.funder,
      recipientName: profile.recipientName,
      awardNumber: profile.awardNumber,
      awardAmount: profile.awardAmount,
      currency: profile.currency ?? "USD",
      startDate: profile.startDate,
      endDate: profile.endDate,
      effectiveDate: profile.effectiveDate,
      grantPeriodText: profile.grantPeriodText,
      programName: profile.programName,
      assistanceType: profile.assistanceType,
      primaryContacts: profile.primaryContacts.map((contact) => ({ ...contact })),
      governingDocuments: profile.governingDocuments,
      status: "active",
      reviewStatus: "not_started",
    });

    const obligationInputs: Omit<Obligation, "id" | "createdAt" | "updatedAt">[] = [];
    const citationInputs: Omit<ObligationCitation, "id" | "obligationId" | "createdAt">[][] = [];

    for (const item of extraction.obligations) {
      obligationInputs.push({
        awardId: award.id,
        organizationId,
        category: item.category,
        title: item.title,
        description: item.description,
        originalDateText: item.originalDateText,
        dueDate: item.dueDate,
        recurrence: item.recurrence,
        internalDueDate: computeInternalDueDate(
          item.dueDate,
          item.suggestedInternalLeadDays,
          item.category,
          item.priority,
        ),
        suggestedOwnerRole: item.suggestedOwnerRole,
        assignedUserId: null,
        priority: item.priority,
        confidence: item.confidence,
        // Stage 8: everything lands as unreviewed. The model cannot confirm itself.
        reviewStatus: "needs_review",
        interpretationLevel: item.interpretationLevel,
        consequence: item.consequence,
        clarificationQuestion: item.clarificationQuestion,
        sourceStatus: sourceStatusFor(item.citations),
        notes: null,
        dateConflicts: item.dateConflicts,
        origin: item.origin,
      });

      citationInputs.push(
        item.citations.map((citation) => ({
          documentSegmentId: citation.segmentId,
          locatorType: citation.locatorType,
          locatorValue: citation.locatorValue,
          excerpt: citation.excerpt,
          startOffset: citation.startOffset,
          endOffset: citation.endOffset,
          matchScore: citation.matchScore,
        })),
      );
    }

    await db.createObligations(obligationInputs, (index) => citationInputs[index] ?? []);

    await db.updateRun(runId, {
      status: extraction.warnings.length > 0 ? "partial" : "succeeded",
      stage: "preparing_review",
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      completedAt: new Date().toISOString(),
      usageMetadata: extraction.usage,
    });

    await db.recordAuditEvent({
      organizationId,
      userId: session.profile.id,
      eventType: "award.processed",
      entityType: "award",
      entityId: award.id,
      // Metadata is deliberately free of document text.
      metadata: {
        obligations: extraction.obligations.length,
        citationCoverage: extraction.coverage.coverage,
        model: extraction.model,
        injectionAttempts: extraction.injectionAttempts.length,
        droppedUnsupported: extraction.droppedUnsupported,
      },
    });

    const warnings = [...extraction.warnings];
    if (extraction.injectionAttempts.length > 0) {
      warnings.push(
        `This document contains ${extraction.injectionAttempts.length} passage${extraction.injectionAttempts.length === 1 ? "" : "s"} written to look like instructions to an AI system. They were treated as ordinary text and ignored.`,
      );
    }

    return {
      ok: true,
      awardId: award.id,
      duplicate: false,
      obligationCount: extraction.obligations.length,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    await db.updateRun(runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      errorCode: "extraction_failed",
      errorMessage: message.slice(0, 500),
    });
    // The award and its document survive so the user can retry without re-uploading.
    await db.updateAward(award.id, organizationId, { status: "failed" });

    return {
      ok: false,
      error: {
        code: "extraction_failed",
        message:
          "The document was stored and read, but the analysis did not finish. You can retry from the award page without uploading again.",
        awardId: award.id,
      },
    };
  }
}

function sourceStatusFor(
  citations: { segmentId: string | null; matchScore: number }[],
): Obligation["sourceStatus"] {
  const best = Math.max(
    0,
    ...citations.filter((citation) => citation.segmentId).map((citation) => citation.matchScore),
  );
  if (best >= 0.85) return "verified";
  if (best >= 0.5) return "partial";
  return "unverified";
}

/**
 * Re-runs extraction against the document already stored for an award.
 *
 * Reuses the stored segments rather than re-parsing, keeps the award id stable
 * so the user stays on the same page, and preserves obligations the user
 * created or already confirmed — only unreviewed machine output is replaced.
 */
export async function reprocessAward(
  session: Session,
  awardId: string,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const organizationId = session.organization.id;
  const award = await db.getAward(awardId, organizationId);
  if (!award) {
    return { ok: false, error: { code: "parse_failed", message: "Award not found." } };
  }

  const documents = await db.listDocuments(awardId, organizationId);
  const document = documents[0];
  if (!document) {
    return {
      ok: false,
      error: { code: "parse_failed", message: "This award has no stored document to re-analyse." },
    };
  }

  const storedSegments = await db.listSegments(document.id);
  if (storedSegments.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_text",
        message: "No readable text was stored for this document. Please upload it again.",
      },
    };
  }

  // Anything the user has touched is theirs and survives re-analysis.
  const existing = await db.listObligations(awardId, organizationId);
  for (const obligation of existing) {
    if (obligation.origin === "manual" || obligation.reviewStatus !== "needs_review") continue;
    await db.deleteObligation(obligation.id, organizationId);
  }

  const run = await db.createRun({
    awardId,
    documentId: document.id,
    status: "running",
    stage: "identifying_award",
    model: null,
    promptVersion: "",
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    usageMetadata: null,
  });

  return extractIntoAward({
    session,
    award,
    runId: run.id,
    segments: storedSegments.map((segment) => ({
      id: segment.id,
      locatorType: segment.locatorType,
      locatorValue: segment.locatorValue,
      heading: segment.heading,
      text: segment.text,
      sequence: segment.sequence,
      tokenEstimate: segment.tokenEstimate,
    })),
    awardNameOverride: award.name,
    onStage: options.onStage,
  });
}
