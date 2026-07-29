import { beforeEach, describe, expect, it } from "vitest";

import { RATE_LIMITS, __resetRateLimits, checkRateLimit } from "@/lib/security/rate-limit";

/** A fixed clock. Nothing here uses timers or wall-clock time. */
const T0 = 1_800_000_000_000;
const POLICY = { limit: 3, windowMs: 60_000 };

beforeEach(() => {
  __resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    for (let index = 0; index < POLICY.limit; index += 1) {
      expect(checkRateLimit("user-1", POLICY, T0).allowed).toBe(true);
    }
  });

  it("counts down the remaining allowance", () => {
    expect(checkRateLimit("user-1", POLICY, T0).remaining).toBe(2);
    expect(checkRateLimit("user-1", POLICY, T0).remaining).toBe(1);
    expect(checkRateLimit("user-1", POLICY, T0).remaining).toBe(0);
  });

  it("blocks the request after the limit is reached", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);

    const blocked = checkRateLimit("user-1", POLICY, T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tells a blocked caller how long to wait", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);

    expect(checkRateLimit("user-1", POLICY, T0).retryAfterSeconds).toBe(60);
    expect(checkRateLimit("user-1", POLICY, T0 + 30_000).retryAfterSeconds).toBe(30);
  });

  it("never advertises a retry delay below one second", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);

    const nearlyExpired = checkRateLimit("user-1", POLICY, T0 + POLICY.windowMs - 1);
    expect(nearlyExpired.allowed).toBe(false);
    expect(nearlyExpired.retryAfterSeconds).toBe(1);
  });

  it("reports no retry delay while requests are still allowed", () => {
    expect(checkRateLimit("user-1", POLICY, T0).retryAfterSeconds).toBe(0);
  });

  it("resets the allowance when the window expires", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);
    expect(checkRateLimit("user-1", POLICY, T0).allowed).toBe(false);

    const afterWindow = checkRateLimit("user-1", POLICY, T0 + POLICY.windowMs);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(POLICY.limit - 1);
  });

  it("does not reset one millisecond before the window ends", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);
    expect(checkRateLimit("user-1", POLICY, T0 + POLICY.windowMs - 1).allowed).toBe(false);
  });

  it("gives a fresh full allowance in the new window", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);

    const next = T0 + POLICY.windowMs;
    for (let index = 0; index < POLICY.limit; index += 1) {
      expect(checkRateLimit("user-1", POLICY, next).allowed).toBe(true);
    }
    expect(checkRateLimit("user-1", POLICY, next).allowed).toBe(false);
  });

  it("keeps separate keys completely independent", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);

    expect(checkRateLimit("user-1", POLICY, T0).allowed).toBe(false);
    expect(checkRateLimit("user-2", POLICY, T0).allowed).toBe(true);
    expect(checkRateLimit("user-2", POLICY, T0).remaining).toBe(1);
  });

  it("keeps the same user's separate endpoints independent", () => {
    for (let index = 0; index < POLICY.limit; index += 1) {
      checkRateLimit("upload:user-1", POLICY, T0);
    }
    expect(checkRateLimit("upload:user-1", POLICY, T0).allowed).toBe(false);
    expect(checkRateLimit("ask:user-1", POLICY, T0).allowed).toBe(true);
  });

  it("blocks immediately for a policy that allows nothing", () => {
    const closed = checkRateLimit("user-1", { limit: 0, windowMs: 60_000 }, T0);
    // The first request in a window always opens the bucket.
    expect(closed.allowed).toBe(true);
    expect(checkRateLimit("user-1", { limit: 0, windowMs: 60_000 }, T0).allowed).toBe(false);
  });

  it("is cleared by the test reset helper", () => {
    for (let index = 0; index < POLICY.limit; index += 1) checkRateLimit("user-1", POLICY, T0);
    expect(checkRateLimit("user-1", POLICY, T0).allowed).toBe(false);

    __resetRateLimits();
    expect(checkRateLimit("user-1", POLICY, T0).allowed).toBe(true);
  });
});

describe("RATE_LIMITS policies", () => {
  it("guards the expensive endpoints most tightly", () => {
    expect(RATE_LIMITS.upload.limit).toBeLessThan(RATE_LIMITS.ask.limit);
    expect(RATE_LIMITS.extraction.limit).toBeLessThan(RATE_LIMITS.export.limit);
  });

  it("uses a short window for sign-in attempts", () => {
    expect(RATE_LIMITS.signIn.windowMs).toBe(15 * 60 * 1000);
    expect(RATE_LIMITS.signIn.limit).toBe(8);
  });

  it("applies each configured policy correctly", () => {
    const policy = RATE_LIMITS.upload;
    for (let index = 0; index < policy.limit; index += 1) {
      expect(checkRateLimit("upload:key", policy, T0).allowed).toBe(true);
    }
    const blocked = checkRateLimit("upload:key", policy, T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(3600);
  });
});
