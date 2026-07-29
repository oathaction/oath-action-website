import { describe, expect, it } from "vitest";

import { PLANS, PLAN_ORDER, canUseReminders, checkAwardEntitlement, planFor } from "@/lib/billing/plans";

import { makeSubscription } from "./_helpers/factories";

describe("planFor", () => {
  it("falls back to the free demo plan with no subscription", () => {
    expect(planFor(null)).toBe(PLANS.demo);
  });

  it("returns the subscribed plan when the subscription is active", () => {
    expect(planFor(makeSubscription({ plan: "small_org", status: "active" }))).toBe(PLANS.small_org);
    expect(planFor(makeSubscription({ plan: "team", status: "active" }))).toBe(PLANS.team);
  });

  it("treats a trialing subscription as active", () => {
    expect(planFor(makeSubscription({ plan: "team", status: "trialing" }))).toBe(PLANS.team);
  });

  it.each(["past_due", "canceled", "incomplete"] as const)(
    "falls back to demo for a %s subscription",
    (status) => {
      expect(planFor(makeSubscription({ plan: "team", status }))).toBe(PLANS.demo);
    },
  );

  it("lists the plans in upgrade order", () => {
    expect(PLAN_ORDER).toEqual(["demo", "single_award", "small_org", "team"]);
  });
});

describe("checkAwardEntitlement — free tier", () => {
  it("allows the first award on the free tier", () => {
    const check = checkAwardEntitlement(null, 0);

    expect(check.allowed).toBe(true);
    expect(check.reason).toBeNull();
    expect(check.plan.id).toBe("demo");
    expect(check.limit).toBe(1);
    expect(check.used).toBe(0);
  });

  it("blocks the second award on the free tier with an actionable reason", () => {
    const check = checkAwardEntitlement(null, 1);

    expect(check.allowed).toBe(false);
    expect(check.reason).toBe(
      "You have used your free award analysis. Choose a plan to analyse more awards.",
    );
    expect(check.limit).toBe(1);
    expect(check.used).toBe(1);
  });

  it("stays blocked when the count somehow exceeds the limit", () => {
    expect(checkAwardEntitlement(null, 9).allowed).toBe(false);
  });
});

describe("checkAwardEntitlement — paid plans", () => {
  it("allows awards up to the plan limit", () => {
    const subscription = makeSubscription({ plan: "small_org", status: "active" });
    expect(checkAwardEntitlement(subscription, 11).allowed).toBe(true);
    expect(checkAwardEntitlement(subscription, 11).limit).toBe(12);
  });

  it("blocks at the plan limit and names the plan and the number", () => {
    const check = checkAwardEntitlement(makeSubscription({ plan: "small_org" }), 12);

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Small Organisation");
    expect(check.reason).toContain("12 awards");
    expect(check.reason).toContain("Upgrade");
  });

  it("gives the team plan a higher ceiling", () => {
    const subscription = makeSubscription({ plan: "team" });
    expect(checkAwardEntitlement(subscription, 49).allowed).toBe(true);
    expect(checkAwardEntitlement(subscription, 50).allowed).toBe(false);
    expect(checkAwardEntitlement(subscription, 50).limit).toBe(50);
  });
});

describe("checkAwardEntitlement — single-award credits", () => {
  it("raises the limit by the number of credits held", () => {
    const check = checkAwardEntitlement(
      makeSubscription({ plan: "single_award", status: "active", awardCredits: 0 }),
      1,
    );
    expect(check.limit).toBe(2);
    expect(check.allowed).toBe(true);
  });

  it("stacks credits from more than one pack", () => {
    const check = checkAwardEntitlement(
      makeSubscription({ plan: "single_award", status: "active", awardCredits: 2 }),
      3,
    );
    expect(check.limit).toBe(4);
    expect(check.allowed).toBe(true);
  });

  it("blocks once the credited limit is used up", () => {
    const check = checkAwardEntitlement(
      makeSubscription({ plan: "single_award", status: "active", awardCredits: 2 }),
      4,
    );
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("4 awards");
  });

  it("does not honour credits on an inactive subscription", () => {
    const check = checkAwardEntitlement(
      makeSubscription({ plan: "single_award", status: "canceled", awardCredits: 5 }),
      1,
    );

    expect(check.plan.id).toBe("demo");
    expect(check.limit).toBe(6);
    expect(check.allowed).toBe(true);
  });

  it("falls back to demo entitlement for a cancelled subscription with no credits", () => {
    const check = checkAwardEntitlement(
      makeSubscription({ plan: "team", status: "canceled", awardCredits: 0 }),
      1,
    );

    expect(check.plan.id).toBe("demo");
    expect(check.limit).toBe(1);
    expect(check.allowed).toBe(false);
  });
});

describe("canUseReminders", () => {
  it("is off for anonymous and free users", () => {
    expect(canUseReminders(null)).toBe(false);
    expect(canUseReminders(makeSubscription({ plan: "demo", status: "active" }))).toBe(false);
  });

  it("is on for every paid plan", () => {
    expect(canUseReminders(makeSubscription({ plan: "single_award", status: "active" }))).toBe(true);
    expect(canUseReminders(makeSubscription({ plan: "small_org", status: "active" }))).toBe(true);
    expect(canUseReminders(makeSubscription({ plan: "team", status: "trialing" }))).toBe(true);
  });

  it("switches off when a paid subscription lapses", () => {
    expect(canUseReminders(makeSubscription({ plan: "team", status: "past_due" }))).toBe(false);
    expect(canUseReminders(makeSubscription({ plan: "small_org", status: "canceled" }))).toBe(false);
  });
});

describe("PLANS", () => {
  it("gives the free plan exactly one award and no reminders", () => {
    expect(PLANS.demo.awardLimit).toBe(1);
    expect(PLANS.demo.emailReminders).toBe(false);
    expect(PLANS.demo.priceEnvKey).toBeNull();
  });

  it("has an entry for every plan in the upgrade order", () => {
    for (const id of PLAN_ORDER) {
      expect(PLANS[id].id).toBe(id);
    }
  });

  it("has non-decreasing award limits along the upgrade path", () => {
    const limits = PLAN_ORDER.map((id) => PLANS[id].awardLimit ?? Number.POSITIVE_INFINITY);
    expect(limits).toEqual([...limits].sort((a, b) => a - b));
  });
});
