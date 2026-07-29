import type { PlanId, Subscription } from "@/lib/domain/types";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  /** Awards that may be processed. `null` means unmetered within fair use. */
  awardLimit: number | null;
  features: string[];
  emailReminders: boolean;
  /** Which env var holds the Stripe price id. */
  priceEnvKey: "singleAward" | "smallOrg" | "team" | null;
  mode: "free" | "payment" | "subscription";
}

export const PLANS: Record<PlanId, Plan> = {
  demo: {
    id: "demo",
    name: "Free",
    price: "$0",
    cadence: "",
    tagline: "Analyse one award and see the whole workflow.",
    awardLimit: 1,
    features: [
      "One award analysis",
      "Full obligation register with source citations",
      "Review and confirm every item",
      "CSV, calendar and JSON export",
    ],
    emailReminders: false,
    priceEnvKey: null,
    mode: "free",
  },
  single_award: {
    id: "single_award",
    name: "Single Award Pack",
    price: "$29",
    cadence: "one time",
    tagline: "For one grant you need under control now.",
    awardLimit: 2,
    features: [
      "One additional award analysis",
      "Everything in Free",
      "Email deadline reminders",
      "Printable operating plan",
    ],
    emailReminders: true,
    priceEnvKey: "singleAward",
    mode: "payment",
  },
  small_org: {
    id: "small_org",
    name: "Small Organisation",
    price: "$29",
    cadence: "per month",
    tagline: "For nonprofits managing a handful of grants.",
    awardLimit: 12,
    features: [
      "Up to 12 awards",
      "Email deadline reminders",
      "Ask this award",
      "Printable operating plan",
      "Priority support",
    ],
    emailReminders: true,
    priceEnvKey: "smallOrg",
    mode: "subscription",
  },
  team: {
    id: "team",
    name: "Team",
    price: "$79",
    cadence: "per month",
    tagline: "For consultants and multi-programme organisations.",
    awardLimit: 50,
    features: [
      "Up to 50 awards",
      "Everything in Small Organisation",
      "Shared organisation workspace",
      "Assisted setup available",
    ],
    emailReminders: true,
    priceEnvKey: "team",
    mode: "subscription",
  },
};

export const PLAN_ORDER: PlanId[] = ["demo", "single_award", "small_org", "team"];

export function planFor(subscription: Subscription | null): Plan {
  if (!subscription) return PLANS.demo;
  const active = subscription.status === "active" || subscription.status === "trialing";
  if (!active) return PLANS.demo;
  return PLANS[subscription.plan] ?? PLANS.demo;
}

export interface EntitlementCheck {
  allowed: boolean;
  reason: string | null;
  plan: Plan;
  used: number;
  limit: number | null;
}

/**
 * Decides whether another award may be processed.
 *
 * Single-award packs add credits rather than raising a tier, so a customer who
 * buys two packs gets two awards without us modelling a second subscription.
 */
export function checkAwardEntitlement(
  subscription: Subscription | null,
  currentAwardCount: number,
): EntitlementCheck {
  const plan = planFor(subscription);
  const credits = subscription?.awardCredits ?? 0;
  const limit = plan.awardLimit === null ? null : plan.awardLimit + credits;

  if (limit === null || currentAwardCount < limit) {
    return { allowed: true, reason: null, plan, used: currentAwardCount, limit };
  }

  return {
    allowed: false,
    reason:
      plan.id === "demo"
        ? "You have used your free award analysis. Choose a plan to analyse more awards."
        : `Your ${plan.name} plan covers ${limit} awards. Upgrade to analyse more.`,
    plan,
    used: currentAwardCount,
    limit,
  };
}

export function canUseReminders(subscription: Subscription | null): boolean {
  return planFor(subscription).emailReminders;
}
