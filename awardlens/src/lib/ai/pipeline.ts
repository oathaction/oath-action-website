import "server-only";

import { generateObject } from "ai";

import type { ProcessingStage, UsageMetadata } from "@/lib/domain/types";
import { checkDuePlausibility } from "@/lib/domain/dates";
import type { SegmentInput } from "@/lib/documents/segment";
import { getServerConfig } from "@/lib/env";
import { getCriticModel, getExtractionModel } from "./model";
import {
  awardProfileSchema,
  criticSchema,
  obligationBatchSchema,
  type ExtractedAwardProfile,
  type ObligationCandidate,
} from "./schemas";
import {
  awardProfileSystemPrompt,
  buildCriticPrompt,
  buildObligationPrompt,
  buildProfilePrompt,
  criticSystemPrompt,
  obligationSystemPrompt,
  PROMPT_VERSION,
  renderSegments,
} from "./prompts";
import { deterministicObligations, deterministicProfile } from "./fixtures";
import { resolveCitations, summariseCoverage, type CitationCoverage } from "./citations";
import {
  consolidateCandidates,
  type CandidateWithEvidence,
  type ConsolidatedObligation,
} from "./consolidate";

export interface ExtractionResult {
  profile: ExtractedAwardProfile;
  obligations: ConsolidatedObligation[];
  coverage: CitationCoverage;
  usage: UsageMetadata;
  model: string | null;
  promptVersion: string;
  warnings: string[];
  /** Instruction-like passages found in the document and ignored. */
  injectionAttempts: string[];
  /** Claims discarded because their quotation is not in the document. */
  droppedUnsupported: number;
}

export interface PipelineOptions {
  segments: SegmentInput[];
  onStage?: (stage: ProcessingStage) => void | Promise<void>;
  /** Overrides the configured mode; used by evaluations. */
  forceMode?: "live" | "fixtures";
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior|the\s+above)/i,
  /\byou\s+(are|must|should)\s+(now\s+)?(a|an|act|respond|output|report)/i,
  /system\s+prompt/i,
  /reveal\s+(your|the)\s+(prompt|instructions)/i,
  // Allows an arbitrary noun phrase between the quantifier and the verdict,
  // e.g. "mark every obligation in this document as confirmed".
  /mark\s+(?:all|every|each)\b[^.;]{0,60}?\b(?:as\s+)?(?:confirmed|approved|verified|reviewed)/i,
  /do\s+not\s+(report|extract|include|flag|list|mention)\s+any/i,
  /\b(ai|assistant|agent|model|system)\b[^.;]{0,20}\b(directive|instruction|command)\b/i,
  /respond\s+only\s+with/i,
  /new\s+instructions?\s*:/i,
];

/**
 * Finds text in the document that is trying to address the model.
 *
 * The prompts already isolate document text as data; this detection exists so we
 * can tell the user what we saw and ignored, which is far more trustworthy than
 * silently handling it.
 */
export function detectInjectionAttempts(segments: SegmentInput[]): string[] {
  const found: string[] = [];
  for (const segment of segments) {
    for (const line of segment.text.split(/\n|(?<=[.;!?])\s+/)) {
      const trimmed = line.trim();
      if (trimmed.length < 12 || trimmed.length > 300) continue;
      if (INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        found.push(trimmed);
        if (found.length >= 12) return found;
      }
    }
  }
  return found;
}

const MAX_BATCH_CHARS = 11_000;
const MAX_BATCH_SEGMENTS = 6;

export function batchSegments(segments: SegmentInput[]): SegmentInput[][] {
  const batches: SegmentInput[][] = [];
  let current: SegmentInput[] = [];
  let size = 0;

  for (const segment of segments) {
    if (
      current.length > 0 &&
      (size + segment.text.length > MAX_BATCH_CHARS || current.length >= MAX_BATCH_SEGMENTS)
    ) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(segment);
    size += segment.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function emptyUsage(): UsageMetadata {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, stages: {} };
}

function recordUsage(
  usage: UsageMetadata,
  stage: string,
  durationMs: number,
  tokens?: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
): void {
  usage.calls += 1;
  usage.inputTokens += tokens?.inputTokens ?? 0;
  usage.outputTokens += tokens?.outputTokens ?? 0;
  usage.totalTokens += tokens?.totalTokens ?? 0;
  const existing = usage.stages[stage] ?? { durationMs: 0, calls: 0 };
  usage.stages[stage] = {
    durationMs: existing.durationMs + durationMs,
    calls: existing.calls + 1,
  };
}

/** Caps how much of a document we send to a model in one run. */
const MAX_SEGMENTS_PER_RUN = 60;

export async function runExtraction(options: PipelineOptions): Promise<ExtractionResult> {
  const config = getServerConfig();
  const mode = options.forceMode ?? config.aiMode;
  const segments = options.segments.slice(0, MAX_SEGMENTS_PER_RUN);
  const warnings: string[] = [];
  const usage = emptyUsage();

  if (options.segments.length > MAX_SEGMENTS_PER_RUN) {
    warnings.push(
      `This document is long. AwardLens analysed the first ${MAX_SEGMENTS_PER_RUN} sections; later sections were not read.`,
    );
  }

  const injectionAttempts = detectInjectionAttempts(segments);

  await options.onStage?.("identifying_award");

  let profile: ExtractedAwardProfile;
  let candidates: CandidateWithEvidence[] = [];

  if (mode === "fixtures") {
    profile = deterministicProfile(segments);
    await options.onStage?.("finding_obligations");
    candidates = deterministicObligations(segments).map((candidate) => ({
      candidate,
      citations: resolveCitations(candidate.citations, segments).citations,
      origin: "extracted" as const,
    }));
  } else {
    const model = getExtractionModel();

    // ---- Stage 3: award profile -----------------------------------------
    const profileSegments = segments.slice(0, 6);
    const profileStart = Date.now();
    try {
      const result = await generateObject({
        model,
        schema: awardProfileSchema,
        system: awardProfileSystemPrompt,
        prompt: buildProfilePrompt(renderSegments(profileSegments)),
        maxRetries: 2,
      });
      recordUsage(usage, "profile", Date.now() - profileStart, result.usage);
      profile = result.object;
    } catch (error) {
      // A failed profile must not lose the obligations, which are the real value.
      warnings.push(
        `Award details could not be extracted automatically (${describeError(error)}). Obligations were still analysed — please fill the award details in yourself.`,
      );
      profile = deterministicProfile(segments);
    }

    // ---- Stage 4: obligation candidates ---------------------------------
    await options.onStage?.("finding_obligations");
    const batches = batchSegments(segments);
    const settled = await Promise.allSettled(
      batches.map(async (batch, index) => {
        const started = Date.now();
        const result = await generateObject({
          model,
          schema: obligationBatchSchema,
          system: obligationSystemPrompt,
          prompt: buildObligationPrompt(
            renderSegments(batch),
            `part ${index + 1} of ${batches.length}`,
          ),
          maxRetries: 2,
        });
        recordUsage(usage, "obligations", Date.now() - started, result.usage);
        return result.object.obligations;
      }),
    );

    const failures = settled.filter((entry) => entry.status === "rejected").length;
    if (failures > 0) {
      warnings.push(
        `${failures} of ${batches.length} sections could not be analysed. The obligations shown are from the sections that succeeded — treat this extraction as incomplete.`,
      );
    }

    const rawCandidates = settled.flatMap((entry) =>
      entry.status === "fulfilled" ? entry.value : [],
    );

    candidates = rawCandidates.map((candidate) => ({
      candidate,
      citations: resolveCitations(candidate.citations, segments).citations,
      origin: "extracted" as const,
    }));

    // ---- Stage 7: completeness critic -----------------------------------
    // Runs before consolidation so its proposals merge with the main pass and
    // face exactly the same citation validation.
    try {
      const criticStart = Date.now();
      const criticResult = await generateObject({
        model: getCriticModel(),
        schema: criticSchema,
        system: criticSystemPrompt,
        prompt: buildCriticPrompt(
          renderSegments(segments.slice(0, 24)),
          rawCandidates.map((candidate) => candidate.title),
        ),
        maxRetries: 1,
      });
      recordUsage(usage, "critic", Date.now() - criticStart, criticResult.usage);
      candidates.push(
        ...criticResult.object.missing.map((candidate) => ({
          candidate,
          citations: resolveCitations(candidate.citations, segments).citations,
          origin: "critic" as const,
        })),
      );
    } catch {
      warnings.push("The completeness review did not run. Some requirements may be missing.");
    }
  }

  // ---- Stage 6: citation validation ------------------------------------
  await options.onStage?.("checking_sources");

  const before = candidates.length;
  // A claim whose quotation appears nowhere in the document is not evidence of
  // anything — it is discarded rather than shown with a warning label.
  const supported = candidates.filter((entry) =>
    entry.citations.some((citation) => citation.segmentId !== null),
  );
  const droppedUnsupported = before - supported.length;
  if (droppedUnsupported > 0) {
    warnings.push(
      `${droppedUnsupported} proposed item${droppedUnsupported === 1 ? "" : "s"} could not be traced to text in this document and ${droppedUnsupported === 1 ? "was" : "were"} discarded.`,
    );
  }

  // ---- Stage 5: consolidation ------------------------------------------
  const consolidated = consolidateCandidates(supported);

  // Dates that fall implausibly outside the award period are not trustworthy.
  for (const obligation of consolidated) {
    if (!obligation.dueDate) continue;
    const verdict = checkDuePlausibility(obligation.dueDate, {
      startDate: profile.startDate,
      endDate: profile.endDate,
    });
    if (!verdict.plausible) {
      obligation.clarificationQuestion ??= `We could not confirm the due date for this item. ${verdict.reason} Please check the award document and set the correct date.`;
      obligation.dueDate = null;
      obligation.confidence = Math.min(obligation.confidence, 0.5);
    }
  }

  await options.onStage?.("preparing_review");

  const coverage = summariseCoverage(
    consolidated.map((obligation) => {
      const best = Math.max(0, ...obligation.citations.map((citation) => citation.matchScore));
      return best >= 0.85 ? "verified" : best >= 0.5 ? "partial" : "unverified";
    }),
  );

  if (!profile.isGrantDocument) {
    warnings.push(
      profile.documentTypeNote ??
        "This document does not appear to be a grant award. The results below may not be meaningful.",
    );
  }

  return {
    profile,
    obligations: consolidated,
    coverage,
    usage,
    model: mode === "live" ? (config.ai.model ?? null) : "deterministic-fixtures",
    promptVersion: PROMPT_VERSION,
    warnings,
    injectionAttempts,
    droppedUnsupported,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (/timeout|ETIMEDOUT|aborted/i.test(error.message)) return "the model timed out";
    if (/rate limit|429/i.test(error.message)) return "the provider rate limit was reached";
    if (/api key|401|403/i.test(error.message)) return "the provider rejected our credentials";
    return error.name === "Error" ? "an unexpected provider error" : error.name;
  }
  return "an unexpected error";
}

export type { ConsolidatedObligation, ObligationCandidate };
