import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getServerConfig } from "@/lib/env";
import { getStripe, planIdFromMetadata } from "@/lib/billing/stripe";
import * as db from "@/lib/db/local";
import type { PlanId, Subscription } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook.
 *
 * Two non-negotiables:
 *  - The signature is verified against the raw body before anything is read.
 *    An unverified webhook is an unauthenticated request that grants paid access.
 *  - Every event id is claimed exactly once, so Stripe's at-least-once delivery
 *    and its retries cannot double-apply an entitlement.
 */
export async function POST(request: NextRequest) {
  const config = getServerConfig();

  if (!config.stripe.secretKey || !config.stripe.webhookSecret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Must be the raw body — parsing it first would break signature verification.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      config.stripe.webhookSecret,
    );
  } catch (error) {
    console.warn("[stripe] signature verification failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const claimed = await db.claimStripeEvent(event.id);
  if (!claimed) {
    // Already processed — acknowledge so Stripe stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
  } catch (error) {
    console.error("[stripe] handler failed", {
      type: event.type,
      error: error instanceof Error ? error.message : "unknown",
    });
    // 500 asks Stripe to retry. The event id is already claimed, so a retry is a
    // no-op; that is the safe direction — never double-grant entitlements.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
      if (!organizationId) return;

      const planId = planIdFromMetadata(session.metadata) ?? "small_org";
      const patch: Partial<Subscription> = {
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        stripeSubscriptionId:
          typeof session.subscription === "string" ? session.subscription : null,
        plan: planId,
        status: "active",
      };

      // A one-off pack adds a credit rather than changing the recurring tier.
      if (session.mode === "payment") {
        const existing = await db.getSubscription(organizationId);
        patch.awardCredits = (existing?.awardCredits ?? 0) + 1;
        patch.plan = existing?.plan && existing.plan !== "demo" ? existing.plan : "single_award";
      }

      await db.upsertSubscription(organizationId, patch);
      await recordBillingAudit(organizationId, "billing.checkout_completed", {
        plan: patch.plan,
        mode: session.mode,
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const organizationId = subscription.metadata?.organizationId;
      if (!organizationId) return;

      const periodEndSeconds = subscription.items.data[0]?.current_period_end;

      await db.upsertSubscription(organizationId, {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId:
          typeof subscription.customer === "string" ? subscription.customer : null,
        plan: planIdFromMetadata(subscription.metadata) ?? "small_org",
        status: mapStatus(subscription.status),
        periodEnd: periodEndSeconds
          ? new Date(periodEndSeconds * 1000).toISOString()
          : null,
      });
      await recordBillingAudit(organizationId, "billing.subscription_updated", {
        status: subscription.status,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const organizationId = subscription.metadata?.organizationId;
      if (!organizationId) return;

      // Drop to the free tier rather than deleting: history and any purchased
      // one-off credits must survive a cancelled subscription.
      await db.upsertSubscription(organizationId, { plan: "demo", status: "canceled" });
      await recordBillingAudit(organizationId, "billing.subscription_cancelled", {});
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const organizationId = invoice.parent?.subscription_details?.metadata?.organizationId;
      if (!organizationId) return;
      await db.upsertSubscription(organizationId, { status: "past_due" });
      await recordBillingAudit(organizationId, "billing.payment_failed", {});
      return;
    }

    default:
      return;
  }
}

function mapStatus(status: Stripe.Subscription.Status): Subscription["status"] {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "incomplete";
  }
}

async function recordBillingAudit(
  organizationId: string,
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.recordAuditEvent({
    organizationId,
    userId: null,
    eventType,
    entityType: "subscription",
    entityId: organizationId,
    // Never record amounts, card details or customer email here.
    metadata,
  });
}

export type { PlanId };
