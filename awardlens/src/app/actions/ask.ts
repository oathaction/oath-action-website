"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { askAward } from "@/lib/ai/ask";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { ActionResult } from "./obligations";

const questionSchema = z.string().trim().min(5).max(400);

export async function askAwardAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const awardId = String(formData.get("awardId") ?? "");
  const parsed = questionSchema.safeParse(String(formData.get("question") ?? ""));

  if (!parsed.success) {
    return { ok: false, message: "Ask a question of between 5 and 400 characters." };
  }

  const limit = checkRateLimit(`ask:${session.organization.id}`, RATE_LIMITS.ask);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `You have asked a lot of questions recently. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
    };
  }

  const award = await db.getAward(awardId, session.organization.id);
  if (!award) return { ok: false, message: "That award no longer exists." };

  const documents = await db.listDocuments(awardId, session.organization.id);
  if (documents.length === 0) {
    return { ok: false, message: "This award has no stored document to search." };
  }

  const segments = await db.listSegments(documents[0].id);
  if (segments.length === 0) {
    return { ok: false, message: "No readable text is stored for this award." };
  }

  try {
    const answer = await askAward(
      parsed.data,
      segments.map((segment) => ({
        id: segment.id,
        locatorType: segment.locatorType,
        locatorValue: segment.locatorValue,
        heading: segment.heading,
        text: segment.text,
        sequence: segment.sequence,
        tokenEstimate: segment.tokenEstimate,
      })),
    );

    await db.createAskExchange({
      awardId,
      organizationId: session.organization.id,
      userId: session.profile.id,
      question: parsed.data,
      answer: answer.answer,
      answerType: answer.answerType,
      interpretationLevel: answer.interpretationLevel,
      citations: answer.citations,
      suggestedFunderQuestion: answer.suggestedFunderQuestion,
    });

    await db.recordAuditEvent({
      organizationId: session.organization.id,
      userId: session.profile.id,
      eventType: "award.asked",
      entityType: "award",
      entityId: awardId,
      // The question itself is award content and stays out of the audit metadata.
      metadata: { answerType: answer.answerType, citations: answer.citations.length },
    });

    revalidatePath(`/app/awards/${awardId}/ask`);
    return { ok: true, message: null };
  } catch (error) {
    console.error("[ask] failed", {
      organizationId: session.organization.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      message: "We could not answer that just now. Please try again in a moment.",
    };
  }
}
