"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db/local";
import { reprocessAward } from "@/lib/awards/process";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { ActionResult } from "./obligations";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const detailsSchema = z.object({
  awardId: z.string().min(1),
  name: z.string().trim().min(2).max(140),
  funder: z.string().trim().max(140).nullable(),
  recipientName: z.string().trim().max(140).nullable(),
  awardNumber: z.string().trim().max(80).nullable(),
  awardAmount: z.number().nonnegative().nullable(),
  startDate: isoDate,
  endDate: isoDate,
});

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export async function updateAwardDetailsAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const amountRaw = emptyToNull(formData.get("awardAmount"));
  const amount = amountRaw === null ? null : Number(amountRaw.replace(/[,$\s]/g, ""));

  const parsed = detailsSchema.safeParse({
    awardId: formData.get("awardId"),
    name: formData.get("name"),
    funder: emptyToNull(formData.get("funder")),
    recipientName: emptyToNull(formData.get("recipientName")),
    awardNumber: emptyToNull(formData.get("awardNumber")),
    awardAmount: amount !== null && Number.isFinite(amount) ? amount : null,
    startDate: emptyToNull(formData.get("startDate")),
    endDate: emptyToNull(formData.get("endDate")),
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the award details — something was not valid." };
  }

  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, message: "The end date cannot be before the start date." };
  }

  const updated = await db.updateAward(parsed.data.awardId, session.organization.id, {
    name: parsed.data.name,
    funder: parsed.data.funder,
    recipientName: parsed.data.recipientName,
    awardNumber: parsed.data.awardNumber,
    awardAmount: parsed.data.awardAmount,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  });

  if (!updated) return { ok: false, message: "That award no longer exists." };

  revalidatePath("/app");
  revalidatePath(`/app/awards/${parsed.data.awardId}`);
  return { ok: true, message: "Award details saved." };
}

/**
 * Deletes an award and everything derived from it, including the stored
 * document bytes. There is no soft delete: a user asking us to remove a private
 * grant document should get exactly that.
 */
export async function deleteAwardAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const awardId = String(formData.get("awardId") ?? "");

  const award = await db.getAward(awardId, session.organization.id);
  if (!award) redirect("/app");

  const documents = await db.listDocuments(awardId, session.organization.id);
  for (const document of documents) {
    await db.deleteDocument(document.id, session.organization.id);
  }
  await db.deleteAward(awardId, session.organization.id);

  await db.recordAuditEvent({
    organizationId: session.organization.id,
    userId: session.profile.id,
    eventType: "award.deleted",
    entityType: "award",
    entityId: awardId,
    metadata: { documents: documents.length },
  });

  revalidatePath("/app");
  redirect("/app");
}

/** Removes the stored source document while keeping the reviewed register. */
export async function deleteDocumentAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const documentId = String(formData.get("documentId") ?? "");

  const document = await db.getDocument(documentId, session.organization.id);
  if (!document) return { ok: false, message: "That document no longer exists." };

  await db.deleteDocument(documentId, session.organization.id);
  await db.recordAuditEvent({
    organizationId: session.organization.id,
    userId: session.profile.id,
    eventType: "document.deleted",
    entityType: "document",
    entityId: documentId,
    metadata: { awardId: document.awardId },
  });

  revalidatePath(`/app/awards/${document.awardId}`);
  return {
    ok: true,
    message:
      "Document deleted. Your obligations remain, but their source passages can no longer be opened.",
  };
}

export async function reprocessAwardAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const awardId = String(formData.get("awardId") ?? "");

  const limit = checkRateLimit(`extract:${session.organization.id}`, RATE_LIMITS.extraction);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `Too many analyses in a short time. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
    };
  }

  const result = await reprocessAward(session, awardId);

  revalidatePath("/app");
  revalidatePath(`/app/awards/${awardId}`);
  revalidatePath(`/app/awards/${awardId}/review`);
  revalidatePath(`/app/awards/${awardId}/obligations`);

  if (!result.ok) return { ok: false, message: result.error.message };
  return {
    ok: true,
    message: `Re-analysed. ${result.obligationCount} items found. Anything you had already reviewed was kept.`,
  };
}
