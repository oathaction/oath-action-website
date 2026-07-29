"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import {
  OBLIGATION_CATEGORIES,
  OBLIGATION_PRIORITIES,
  REVIEW_STATUSES,
  type ReviewStatus,
} from "@/lib/domain/types";
import { computeInternalDueDate } from "@/lib/domain/dates";
import { syncRemindersForObligation } from "@/lib/reminders";

export interface ActionResult {
  ok: boolean;
  message: string | null;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const editSchema = z.object({
  obligationId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(2000),
  category: z.enum(OBLIGATION_CATEGORIES),
  priority: z.enum(OBLIGATION_PRIORITIES),
  dueDate: isoDate,
  internalDueDate: isoDate,
  recurrence: z.string().trim().max(80).nullable(),
  suggestedOwnerRole: z.string().trim().max(80).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

/**
 * Applies a user's edits.
 *
 * An edited obligation stops being machine output: its interpretation level
 * becomes user-entered and its source status is left alone so the provenance of
 * the original claim stays visible.
 */
export async function updateObligationAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsed = editSchema.safeParse({
    obligationId: formData.get("obligationId"),
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    priority: formData.get("priority"),
    dueDate: emptyToNull(formData.get("dueDate")),
    internalDueDate: emptyToNull(formData.get("internalDueDate")),
    recurrence: emptyToNull(formData.get("recurrence")),
    suggestedOwnerRole: emptyToNull(formData.get("suggestedOwnerRole")),
    notes: emptyToNull(formData.get("notes")),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Those values are not valid." };
  }

  const existing = await db.getObligation(parsed.data.obligationId, session.organization.id);
  if (!existing) return { ok: false, message: "That item no longer exists." };

  const internalDueDate =
    parsed.data.internalDueDate ??
    computeInternalDueDate(parsed.data.dueDate, null, parsed.data.category, parsed.data.priority);

  const updated = await db.updateObligation(parsed.data.obligationId, session.organization.id, {
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    priority: parsed.data.priority,
    dueDate: parsed.data.dueDate,
    internalDueDate,
    recurrence: parsed.data.recurrence,
    suggestedOwnerRole: parsed.data.suggestedOwnerRole,
    notes: parsed.data.notes,
    // The date the user set is authoritative — the recorded conflict is resolved.
    dateConflicts: parsed.data.dueDate !== existing.dueDate ? [] : existing.dateConflicts,
  });

  if (updated) {
    await syncRemindersForObligation(session, updated);
    await db.recordAuditEvent({
      organizationId: session.organization.id,
      userId: session.profile.id,
      eventType: "obligation.edited",
      entityType: "obligation",
      entityId: updated.id,
      metadata: { awardId: updated.awardId },
    });
  }

  revalidateAward(existing.awardId);
  return { ok: true, message: "Saved." };
}

export async function setReviewStatusAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const obligationId = String(formData.get("obligationId") ?? "");
  const status = String(formData.get("reviewStatus") ?? "");

  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) {
    return { ok: false, message: "Unknown review status." };
  }

  const existing = await db.getObligation(obligationId, session.organization.id);
  if (!existing) return { ok: false, message: "That item no longer exists." };

  const updated = await db.updateObligation(obligationId, session.organization.id, {
    reviewStatus: status as ReviewStatus,
  });

  if (updated) {
    await syncRemindersForObligation(session, updated);
    await db.recordAuditEvent({
      organizationId: session.organization.id,
      userId: session.profile.id,
      eventType: `obligation.${status}`,
      entityType: "obligation",
      entityId: obligationId,
      metadata: { awardId: existing.awardId },
    });
    await refreshAwardReviewStatus(session.organization.id, existing.awardId);
  }

  revalidateAward(existing.awardId);
  return { ok: true, message: null };
}

const createSchema = z.object({
  awardId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(2000),
  category: z.enum(OBLIGATION_CATEGORIES),
  priority: z.enum(OBLIGATION_PRIORITIES),
  dueDate: isoDate,
  suggestedOwnerRole: z.string().trim().max(80).nullable(),
});

/** Manually added obligations are user-authored: confirmed, with no citation. */
export async function addObligationAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsed = createSchema.safeParse({
    awardId: formData.get("awardId"),
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    priority: formData.get("priority"),
    dueDate: emptyToNull(formData.get("dueDate")),
    suggestedOwnerRole: emptyToNull(formData.get("suggestedOwnerRole")),
  });

  if (!parsed.success) {
    return { ok: false, message: "Fill in a title, a description and a category." };
  }

  const award = await db.getAward(parsed.data.awardId, session.organization.id);
  if (!award) return { ok: false, message: "That award no longer exists." };

  const created = await db.createObligations(
    [
      {
        awardId: award.id,
        organizationId: session.organization.id,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description,
        originalDateText: null,
        dueDate: parsed.data.dueDate,
        recurrence: null,
        internalDueDate: computeInternalDueDate(
          parsed.data.dueDate,
          null,
          parsed.data.category,
          parsed.data.priority,
        ),
        suggestedOwnerRole: parsed.data.suggestedOwnerRole,
        assignedUserId: null,
        priority: parsed.data.priority,
        confidence: 1,
        reviewStatus: "confirmed",
        interpretationLevel: "explicit",
        consequence: null,
        clarificationQuestion: null,
        sourceStatus: "unverified",
        notes: null,
        dateConflicts: [],
        origin: "manual",
      },
    ],
    () => [],
  );

  if (created[0]) await syncRemindersForObligation(session, created[0]);

  revalidateAward(award.id);
  return { ok: true, message: "Added." };
}

export async function deleteObligationAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const obligationId = String(formData.get("obligationId") ?? "");

  const existing = await db.getObligation(obligationId, session.organization.id);
  if (!existing) return { ok: false, message: "That item no longer exists." };

  await db.deleteObligation(obligationId, session.organization.id);
  revalidateAward(existing.awardId);
  return { ok: true, message: "Deleted." };
}

/**
 * Bulk confirmation, restricted to items whose source we actually verified.
 * Confirming an unverified claim in bulk is exactly the mistake this product
 * exists to prevent, so those are skipped and reported.
 */
export async function bulkConfirmAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const awardId = String(formData.get("awardId") ?? "");

  const award = await db.getAward(awardId, session.organization.id);
  if (!award) return { ok: false, message: "That award no longer exists." };

  const obligations = await db.listObligations(awardId, session.organization.id);
  const eligible = obligations.filter(
    (obligation) =>
      obligation.reviewStatus === "needs_review" &&
      obligation.sourceStatus === "verified" &&
      obligation.confidence >= 0.75 &&
      obligation.dateConflicts.length === 0,
  );

  for (const obligation of eligible) {
    const updated = await db.updateObligation(obligation.id, session.organization.id, {
      reviewStatus: "confirmed",
    });
    if (updated) await syncRemindersForObligation(session, updated);
  }

  await refreshAwardReviewStatus(session.organization.id, awardId);
  await db.recordAuditEvent({
    organizationId: session.organization.id,
    userId: session.profile.id,
    eventType: "obligation.bulk_confirmed",
    entityType: "award",
    entityId: awardId,
    metadata: { count: eligible.length },
  });

  const skipped = obligations.filter(
    (obligation) => obligation.reviewStatus === "needs_review",
  ).length - eligible.length;

  revalidateAward(awardId);
  return {
    ok: true,
    message:
      skipped > 0
        ? `Confirmed ${eligible.length}. ${skipped} still need you to look at them individually because the source could not be verified, confidence was low, or the dates conflict.`
        : `Confirmed ${eligible.length} ${eligible.length === 1 ? "item" : "items"}.`,
  };
}

async function refreshAwardReviewStatus(organizationId: string, awardId: string): Promise<void> {
  const obligations = await db.listObligations(awardId, organizationId);
  const active = obligations.filter((obligation) => obligation.reviewStatus !== "archived");
  const outstanding = active.filter(
    (obligation) => obligation.reviewStatus === "needs_review",
  ).length;

  await db.updateAward(awardId, organizationId, {
    reviewStatus:
      active.length === 0
        ? "not_started"
        : outstanding === 0
          ? "complete"
          : outstanding === active.length
            ? "not_started"
            : "in_progress",
  });
}

function revalidateAward(awardId: string): void {
  revalidatePath("/app");
  revalidatePath(`/app/awards/${awardId}`);
  revalidatePath(`/app/awards/${awardId}/review`);
  revalidatePath(`/app/awards/${awardId}/obligations`);
  revalidatePath(`/app/awards/${awardId}/plan`);
}
