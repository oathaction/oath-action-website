import "server-only";

import { generateObject } from "ai";

import type { AskCitation, InterpretationLevel } from "@/lib/domain/types";
import type { SegmentInput } from "@/lib/documents/segment";
import { formatLocator } from "@/lib/documents/segment";
import { getServerConfig } from "@/lib/env";
import { getExtractionModel } from "./model";
import { askAnswerSchema } from "./schemas";
import { askSystemPrompt, buildAskPrompt, renderSegments } from "./prompts";
import { resolveCitations } from "./citations";
import { tokenSet } from "./consolidate";

export interface AskResult {
  answerType: "answered" | "not_addressed" | "uncertain";
  answer: string;
  interpretationLevel: InterpretationLevel;
  citations: AskCitation[];
  suggestedFunderQuestion: string | null;
  /** True when the answer came from retrieval only, with no model call. */
  retrievalOnly: boolean;
}

/**
 * Lexical retrieval over the award's own segments.
 *
 * Deliberately simple: no embeddings, no vector store. Award documents are tens
 * of pages, not millions, so term overlap plus a phrase bonus retrieves well
 * enough, keeps the whole feature dependency-free, and never sends the document
 * anywhere just to build an index.
 */
export function retrieveSegments(
  question: string,
  segments: SegmentInput[],
  limit = 6,
): { segment: SegmentInput; score: number }[] {
  const terms = tokenSet(question);
  if (terms.size === 0) return [];

  const phrase = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const scored = segments.map((segment) => {
    const haystack = segment.text.toLowerCase();
    const segmentTerms = tokenSet(segment.text);

    let hits = 0;
    for (const term of terms) if (segmentTerms.has(term)) hits += 1;
    let score = hits / terms.size;

    // Reward a literal phrase match; it is a much stronger signal than overlap.
    if (phrase.length > 12 && haystack.includes(phrase)) score += 0.5;
    // Slightly favour shorter segments so a long page cannot dominate on volume.
    score *= 1 + Math.min(0.2, 600 / Math.max(600, segment.text.length));

    return { segment, score };
  });

  return scored
    .filter((entry) => entry.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const NOT_ADDRESSED_MESSAGE =
  "This award's documents do not appear to address that. AwardLens will not guess at what a grant usually says — if this matters, ask the funder directly.";

export async function askAward(
  question: string,
  segments: SegmentInput[],
): Promise<AskResult> {
  const config = getServerConfig();
  const retrieved = retrieveSegments(question, segments);

  if (retrieved.length === 0) {
    return {
      answerType: "not_addressed",
      answer: NOT_ADDRESSED_MESSAGE,
      interpretationLevel: "explicit",
      citations: [],
      suggestedFunderQuestion: suggestFunderQuestion(question),
      retrievalOnly: config.aiMode === "fixtures",
    };
  }

  if (config.aiMode === "fixtures") {
    // Retrieval only. We surface the passages and say exactly that, rather than
    // composing an answer we have no model to write.
    return {
      answerType: "uncertain",
      answer:
        `No AI model is configured, so AwardLens cannot compose an answer. These are the passages in this award that most closely match your question — read them and judge for yourself.\n\n` +
        retrieved
          .map(
            (entry) =>
              `${formatLocator(entry.segment.locatorType, entry.segment.locatorValue)}: ${truncateSentence(entry.segment.text)}`,
          )
          .join("\n\n"),
      interpretationLevel: "uncertain",
      citations: retrieved.map((entry) => ({
        locatorType: entry.segment.locatorType,
        locatorValue: entry.segment.locatorValue,
        excerpt: truncateSentence(entry.segment.text),
        segmentId: entry.segment.id,
      })),
      suggestedFunderQuestion: null,
      retrievalOnly: true,
    };
  }

  const result = await generateObject({
    model: getExtractionModel(),
    schema: askAnswerSchema,
    system: askSystemPrompt,
    prompt: buildAskPrompt(question, renderSegments(retrieved.map((entry) => entry.segment))),
    maxRetries: 2,
  });

  // The answer's citations pass through exactly the same validation as an
  // extraction's: a quote that is not in the document gets no locator.
  const resolved = resolveCitations(
    result.object.citations,
    retrieved.map((entry) => entry.segment),
  );

  const citations: AskCitation[] = resolved.citations
    .filter((citation) => citation.segmentId !== null)
    .map((citation) => ({
      locatorType: citation.locatorType,
      locatorValue: citation.locatorValue,
      excerpt: citation.excerpt,
      segmentId: citation.segmentId,
    }));

  // An "answered" verdict with no verifiable citation is downgraded rather than
  // presented as grounded.
  const answerType =
    result.object.answerType === "answered" && citations.length === 0
      ? "uncertain"
      : result.object.answerType;

  return {
    answerType,
    answer: result.object.answer,
    interpretationLevel: result.object.interpretationLevel,
    citations,
    suggestedFunderQuestion: result.object.suggestedFunderQuestion,
    retrievalOnly: false,
  };
}

function truncateSentence(text: string, max = 320): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return `${(lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim()}…`;
}

function suggestFunderQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  const body = trimmed.endsWith("?") ? trimmed.slice(0, -1) : trimmed;
  return `We could not find anything in the award documents covering this. Could you confirm: ${body.charAt(0).toLowerCase()}${body.slice(1)}?`;
}

export { SUGGESTED_QUESTIONS } from "./suggested-questions";
