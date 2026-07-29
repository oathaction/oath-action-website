"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import * as db from "@/lib/db";
import { getServerConfig } from "@/lib/env";
import { loginCodeEmail, sendEmail } from "@/lib/email";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  createSession,
  destroySession,
  generateLoginCode,
  hashLoginCode,
} from "@/lib/auth/session";

export interface AuthState {
  status: "idle" | "code_sent" | "error";
  email: string;
  message: string | null;
  /**
   * Outside production, the code is returned so local development and CI work
   * without an email provider. It is never returned in a production build —
   * doing so would let anyone sign in as anyone.
   */
  devCode?: string;
}

// A "use server" module may only export async functions, so the form's initial
// state lives with the form rather than here.

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code.");

/**
 * Best-effort client identity for rate limiting.
 *
 * `x-forwarded-for` is only trustworthy if the edge REPLACES it. Many proxies
 * append instead, which makes the leftmost hop entirely attacker-chosen and the
 * limiter trivially bypassable with one header per request. Platform-set
 * headers are preferred for that reason, and the per-email ceiling in
 * `requestLoginCode` is the control that does not depend on this value at all.
 */
async function clientKey(): Promise<string> {
  const headerList = await headers();
  const trusted =
    headerList.get("x-vercel-forwarded-for") ?? headerList.get("x-real-ip");
  if (trusted) return trusted.trim();

  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export async function requestLoginCode(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { status: "error", email: rawEmail, message: parsed.error.issues[0]?.message ?? "Invalid email." };
  }
  const email = parsed.data;

  const limit = checkRateLimit(`signin:${await clientKey()}`, RATE_LIMITS.signIn);
  if (!limit.allowed) {
    return {
      status: "error",
      email,
      message: `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
    };
  }

  // Independent of the IP-derived key above: an attacker who can vary that key
  // still cannot cycle codes at a single address.
  for (const policy of [RATE_LIMITS.signInEmail, RATE_LIMITS.signInEmailDaily]) {
    const perEmail = checkRateLimit(
      `signin-email:${policy.windowMs}:${email}`,
      policy,
    );
    if (!perEmail.allowed) {
      return {
        status: "error",
        email,
        message:
          "Too many sign-in codes have been requested for this address recently. Please wait before trying again.",
      };
    }
  }

  const config = getServerConfig();
  if (config.isProduction && config.emailMode === "console") {
    return {
      status: "error",
      email,
      message:
        "Email delivery is not configured on this deployment, so sign-in codes cannot be sent. Set RESEND_API_KEY and EMAIL_FROM.",
    };
  }

  const code = generateLoginCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db.saveLoginCode(email, await hashLoginCode(email, code), expiresAt);

  const message = loginCodeEmail(code);
  const result = await sendEmail({ to: email, ...message });

  if (!result.ok) {
    return {
      status: "error",
      email,
      message: "We could not send the sign-in code. Please try again in a moment.",
    };
  }

  return {
    status: "code_sent",
    email,
    message: `We sent a six-digit code to ${email}. It expires in 15 minutes.`,
    devCode: showDevCode(config) ? code : undefined,
  };
}

/**
 * Whether the one-time code may be shown on screen.
 *
 * Echoing a code to the browser means "type any email address, receive that
 * account's login code" — total account takeover. A single NODE_ENV check is
 * too thin a wall for that: a staging box, a custom server or a container image
 * that drops the variable would silently open it.
 *
 * So three independent conditions must all hold: this is not a production
 * build, no real email provider is configured (if mail can be delivered there
 * is no reason to display it), and an operator has explicitly opted in.
 */
function showDevCode(config: ReturnType<typeof getServerConfig>): boolean {
  if (config.isProduction) return false;
  if (config.emailMode !== "console") return false;
  return process.env.AWARDLENS_SHOW_DEV_CODES !== "0";
}

export async function verifyLoginCode(
  previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? previous.email));
  const code = codeSchema.safeParse(String(formData.get("code") ?? ""));

  if (!email.success) {
    return { status: "error", email: previous.email, message: "Start again — that email was not valid." };
  }
  if (!code.success) {
    return {
      status: "code_sent",
      email: email.data,
      message: code.error.issues[0]?.message ?? "Enter the six-digit code.",
    };
  }

  const limit = checkRateLimit(`verify:${await clientKey()}`, RATE_LIMITS.signIn);
  if (!limit.allowed) {
    return {
      status: "error",
      email: email.data,
      message: "Too many attempts. Please wait a few minutes and start again.",
    };
  }

  const outcome = await db.consumeLoginCode(
    email.data,
    await hashLoginCode(email.data, code.data),
  );

  if (outcome !== "ok") {
    const message =
      outcome === "expired"
        ? "That code has expired. Request a new one."
        : outcome === "too_many_attempts"
          ? "Too many incorrect codes. Request a new one."
          : "That code is not correct.";
    return { status: "code_sent", email: email.data, message };
  }

  let profile = await db.findProfileByEmail(email.data);
  profile ??= await db.createProfile(email.data, null);

  await createSession(profile.id);
  await db.getOrCreateOrganizationForUser(profile.id, defaultOrgName(email.data));

  redirect("/app");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

function defaultOrgName(email: string): string {
  const domain = email.split("@")[1] ?? "";
  const generic = new Set([
    "gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
    "protonmail.com", "aol.com", "me.com", "live.com", "mail.com",
  ]);
  if (!domain || generic.has(domain)) {
    const local = email.split("@")[0] ?? "My";
    return `${local.charAt(0).toUpperCase()}${local.slice(1)}'s organisation`;
  }
  const bare = domain.split(".")[0] ?? domain;
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}
