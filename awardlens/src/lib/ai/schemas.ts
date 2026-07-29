import { z } from "zod";

import { INTERPRETATION_LEVELS, LOCATOR_TYPES, OBLIGATION_CATEGORIES, OBLIGATION_PRIORITIES } from "@/lib/domain/types";

/**
 * Schemas for every structured model call.
 *
 * Two rules run through all of them:
 *  - Unknown values are `null`, never a guess. The model is told this explicitly
 *    and the schema makes the null path as cheap as the value path.
 *  - Every claim carries a citation whose locator must resolve to a real stored
 *    segment. Validation of that happens in `citations.ts`; the schema only
 *    guarantees the shape.
 */

/** ISO calendar date. Rejects the "2026-13-45" class of model output. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Not a real calendar date");

export const citationSchema = z.object({
  segmentId: z
    .string()
    .min(1)
    .describe("The exact id of the segment this claim came from, e.g. \"s4\"."),
  locatorType: z.enum(LOCATOR_TYPES),
  locatorValue: z
    .string()
    .min(1)
    .describe("The page number, section number or paragraph number, exactly as given for that segment."),
  excerpt: z
    .string()
    .min(12)
    .max(600)
    .describe(
      "A verbatim quotation copied from the segment that states this requirement. Copy the characters exactly; do not paraphrase, summarise or repair the text.",
    ),
});

export type ExtractedCitation = z.infer<typeof citationSchema>;

export const awardContactSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  organization: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const awardProfileSchema = z.object({
  awardName: z.string().nullable().describe("The title of the grant or project, if stated."),
  funder: z.string().nullable().describe("The organisation providing the funds."),
  recipientName: z.string().nullable().describe("The organisation receiving the funds."),
  awardNumber: z.string().nullable(),
  awardAmount: z
    .number()
    .nullable()
    .describe("The total award amount as a number, with no currency symbol or separators."),
  currency: z.string().nullable().describe("ISO currency code such as USD. Null if not stated."),
  effectiveDate: isoDateSchema.nullable(),
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema.nullable(),
  grantPeriodText: z
    .string()
    .nullable()
    .describe("The grant period exactly as the document words it."),
  programName: z.string().nullable(),
  assistanceType: z
    .string()
    .nullable()
    .describe("Assistance listing / CFDA number or funding type, if stated."),
  primaryContacts: z.array(awardContactSchema).max(6),
  governingDocuments: z
    .array(z.string())
    .max(20)
    .describe(
      "Other documents this award incorporates by reference, such as \"2 CFR Part 200\" or \"Exhibit B\".",
    ),
  isGrantDocument: z
    .boolean()
    .describe("False if this document is not a grant, award, or funding agreement at all."),
  documentTypeNote: z
    .string()
    .nullable()
    .describe("If this is not a grant document, say briefly what it appears to be."),
  citations: z.array(citationSchema).max(12),
});

export type ExtractedAwardProfile = z.infer<typeof awardProfileSchema>;

export const obligationCandidateSchema = z.object({
  category: z.enum(OBLIGATION_CATEGORIES),
  title: z
    .string()
    .min(3)
    .max(120)
    .describe("A short specific label, e.g. \"Quarterly financial report (SF-425)\"."),
  description: z
    .string()
    .min(10)
    .max(700)
    .describe(
      "Plain language explanation of what the organisation must actually do. Write for a busy non-specialist. Do not state legal conclusions.",
    ),
  originalDateText: z
    .string()
    .nullable()
    .describe(
      "The document's own wording for the timing, e.g. \"within 30 days of the end of each quarter\". Null if the document gives no timing.",
    ),
  normalizedDueDate: isoDateSchema
    .nullable()
    .describe(
      "A calendar date ONLY when the document states or unambiguously determines one. If timing is relative, recurring or absent, use null and rely on originalDateText.",
    ),
  recurrence: z
    .string()
    .nullable()
    .describe("e.g. \"quarterly\", \"annually\", \"monthly\". Null for one-off obligations."),
  suggestedInternalLeadDays: z
    .number()
    .int()
    .min(0)
    .max(180)
    .nullable()
    .describe("How many days before the due date internal preparation should start."),
  suggestedOwnerRole: z
    .string()
    .nullable()
    .describe(
      "A role, not a person, e.g. \"Finance lead\", \"Programme manager\", \"Executive director\".",
    ),
  priority: z.enum(OBLIGATION_PRIORITIES),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How confident you are that this is a genuine obligation stated by this document."),
  interpretationLevel: z
    .enum(INTERPRETATION_LEVELS)
    .describe(
      "\"explicit\" when the document states it directly; \"light_interpretation\" when you combined nearby statements; \"uncertain\" when the wording is genuinely ambiguous.",
    ),
  consequence: z
    .string()
    .nullable()
    .describe("Only when the document states or clearly implies a consequence. Otherwise null."),
  clarificationQuestion: z
    .string()
    .nullable()
    .describe("A question the organisation should ask the funder, when something is unresolved."),
  citations: z.array(citationSchema).min(1).max(4),
});

export type ObligationCandidate = z.infer<typeof obligationCandidateSchema>;

export const obligationBatchSchema = z.object({
  obligations: z.array(obligationCandidateSchema).max(25),
});

/** Citation validation verdicts, produced by an independent model pass. */
export const citationVerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      obligationIndex: z.number().int().min(0),
      support: z
        .enum(["supports", "partial", "unsupported"])
        .describe(
          "\"supports\" when the quoted text plainly states this obligation; \"partial\" when it is related but incomplete; \"unsupported\" when the quote does not establish it.",
        ),
      reason: z.string().max(300),
    }),
  ),
});

/** Completeness critic — proposes requirements the first pass may have missed. */
export const criticSchema = z.object({
  missing: z.array(obligationCandidateSchema).max(12),
  checkedAreas: z.array(z.string()).max(24),
});

export const askAnswerSchema = z.object({
  answerType: z
    .enum(["answered", "not_addressed", "uncertain"])
    .describe(
      "\"not_addressed\" when the document simply does not cover the question. Never invent an answer.",
    ),
  answer: z
    .string()
    .min(1)
    .max(1600)
    .describe("A direct, plain-language answer grounded only in the provided excerpts."),
  interpretationLevel: z.enum(INTERPRETATION_LEVELS),
  citations: z.array(citationSchema).max(6),
  suggestedFunderQuestion: z
    .string()
    .nullable()
    .describe("A question to send the funder when the document leaves this unresolved."),
});

export type AskAnswer = z.infer<typeof askAnswerSchema>;
