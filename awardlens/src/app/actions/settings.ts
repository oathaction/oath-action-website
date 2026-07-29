"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { destroySession } from "@/lib/auth/session";
import * as db from "@/lib/db";
import { getServerConfig } from "@/lib/env";
import { createCheckoutSession } from "@/lib/billing/stripe";
import { REMINDER_OFFSETS, type PlanId } from "@/lib/domain/types";
import { PLANS } from "@/lib/billing/plans";
import { syncRemindersForObligation } from "@/lib/reminders";
import type { ActionResult } from "./obligations";

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 120);
  await db.updateProfile(session.profile.id, { fullName: fullName || null });
  revalidatePath("/app/settings");
  return { ok: true, message: "Profile saved." };
}

export async function updateOrganizationAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = z
    .string()
    .trim()
    .min(2)
    .max(120)
    .safeParse(String(formData.get("name") ?? ""));

  if (!parsed.success) {
    return { ok: false, message: "Organisation names must be between 2 and 120 characters." };
  }

  await db.renameOrganization(session.organization.id, parsed.data);
  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { ok: true, message: "Organisation name saved." };
}

/**
 * Saves reminder preferences and re-synchronises every scheduled reminder so a
 * change takes effect immediately rather than at the next confirmation.
 */
export async function updateNotificationPreferencesAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession();

  const enabled = formData.get("enabled") === "on";
  const offsets = REMINDER_OFFSETS.filter((offset) =>
    formData.getAll("offsets").includes(String(offset)),
  );

  await db.setNotificationPreferences({
    userId: session.profile.id,
    organizationId: session.organization.id,
    enabled,
    offsets: [...offsets],
  });

  const obligations = await db.listObligationsForOrganization(session.organization.id);
  for (const obligation of obligations) {
    if (obligation.reviewStatus !== "confirmed" || !obligation.dueDate) continue;
    await syncRemindersForObligation(session, obligation);
  }

  revalidatePath("/app/settings");
  return {
    ok: true,
    message: enabled
      ? `Reminders on. You'll be emailed ${offsets.length > 0 ? offsets.join(", ") : "no"} days before confirmed deadlines.`
      : "Reminders turned off.",
  };
}

/**
 * Starts checkout. In development billing mode there is no Stripe call — the
 * entitlement is granted directly and audited as a development grant so it can
 * never be mistaken for a real payment.
 */
export async function startCheckoutAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const config = getServerConfig();
  const planId = String(formData.get("planId") ?? "") as PlanId;

  if (!(planId in PLANS) || planId === "demo") {
    return { ok: false, message: "Choose a plan to continue." };
  }

  if (config.billingMode === "development") {
    if (config.isProduction) {
      return {
        ok: false,
        message:
          "Development billing cannot grant plans in a production deployment. Configure Stripe.",
      };
    }

    const existing = await db.getSubscription(session.organization.id);
    await db.upsertSubscription(session.organization.id, {
      plan: planId,
      status: "active",
      awardCredits:
        planId === "single_award" ? (existing?.awardCredits ?? 0) + 1 : (existing?.awardCredits ?? 0),
    });
    await db.recordAuditEvent({
      organizationId: session.organization.id,
      userId: session.profile.id,
      eventType: "billing.development_grant",
      entityType: "subscription",
      entityId: session.organization.id,
      metadata: { plan: planId, note: "Granted in development billing mode. No payment taken." },
    });

    revalidatePath("/app/settings");
    revalidatePath("/app/awards/new");
    return {
      ok: true,
      message: `Development mode: ${PLANS[planId].name} granted without payment.`,
    };
  }

  const subscription = await db.getSubscription(session.organization.id);
  let url: string;
  try {
    url = await createCheckoutSession({
      planId,
      organizationId: session.organization.id,
      userEmail: session.profile.email,
      existingCustomerId: subscription?.stripeCustomerId ?? null,
    });
  } catch (error) {
    console.error("[billing] checkout failed", {
      organizationId: session.organization.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      message: "We could not start checkout just now. Please try again in a moment.",
    };
  }

  redirect(url);
}

/**
 * Deletes every record belonging to this organisation, then signs the user out.
 * This is the account-level data deletion path, and it is genuinely destructive.
 */
export async function deleteAllDataAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const confirmation = String(formData.get("confirm") ?? "");
  if (confirmation !== session.organization.name) return;

  await db.deleteOrganizationData(session.organization.id);
  await destroySession();
  redirect("/?deleted=1");
}
