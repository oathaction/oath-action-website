import "server-only";

import Stripe from "stripe";

import { getServerConfig } from "@/lib/env";
import { PLANS, type Plan } from "./plans";
import type { PlanId } from "@/lib/domain/types";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const config = getServerConfig();
  if (!config.stripe.secretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }
  // Pin nothing: the installed SDK's default API version is the one its types
  // were generated against, so letting it choose avoids a silent mismatch.
  client ??= new Stripe(config.stripe.secretKey);
  return client;
}

export function priceIdFor(plan: Plan): string | null {
  if (!plan.priceEnvKey) return null;
  const { stripe } = getServerConfig();
  return stripe.prices[plan.priceEnvKey] ?? null;
}

export interface CheckoutRequest {
  planId: PlanId;
  organizationId: string;
  userEmail: string;
  existingCustomerId: string | null;
}

/**
 * Creates a Stripe-hosted Checkout session.
 *
 * We never render a card form ourselves — card data should not touch this
 * application. The organisation id travels in `client_reference_id` and in
 * metadata so the webhook can attribute payment without trusting the client.
 */
export async function createCheckoutSession(request: CheckoutRequest): Promise<string> {
  const config = getServerConfig();
  const plan = PLANS[request.planId];
  const price = priceIdFor(plan);

  if (!price) {
    throw new Error(
      `No Stripe price is configured for the ${plan.name} plan. Set the matching STRIPE_*_PRICE_ID.`,
    );
  }

  const session = await getStripe().checkout.sessions.create({
    mode: plan.mode === "payment" ? "payment" : "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: request.organizationId,
    customer: request.existingCustomerId ?? undefined,
    customer_email: request.existingCustomerId ? undefined : request.userEmail,
    allow_promotion_codes: true,
    metadata: { organizationId: request.organizationId, planId: request.planId },
    subscription_data:
      plan.mode === "subscription"
        ? { metadata: { organizationId: request.organizationId, planId: request.planId } }
        : undefined,
    success_url: `${config.appUrl}/app/settings?checkout=success`,
    cancel_url: `${config.appUrl}/app/settings?checkout=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export function planIdFromMetadata(metadata: Stripe.Metadata | null): PlanId | null {
  const value = metadata?.planId;
  if (!value) return null;
  return value in PLANS ? (value as PlanId) : null;
}
