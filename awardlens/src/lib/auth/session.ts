import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

import { getServerConfig } from "@/lib/env";

export const SESSION_COOKIE = "awardlens_session";
const SESSION_TTL_DAYS = 30;

let cachedSecret: string | null = null;

/**
 * Resolves the signing secret.
 *
 * AUTH_SECRET is authoritative. Without it — local development — we generate a
 * secret once and persist it outside the repo so sessions survive a restart.
 * A generated secret is never acceptable in production because each serverless
 * instance would mint its own and sessions would break unpredictably.
 */
async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const configured = getServerConfig().authSecret;
  if (configured && configured.length >= 16) {
    cachedSecret = configured;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production. Generate one with `openssl rand -base64 32`.",
    );
  }

  const dir = process.env.AWARDLENS_DATA_DIR ?? path.join(process.cwd(), ".awardlens-data");
  const file = path.join(dir, "auth-secret");
  try {
    cachedSecret = (await readFile(file, "utf8")).trim();
    if (cachedSecret.length >= 16) return cachedSecret;
  } catch {
    // falls through to generation
  }

  cachedSecret = randomBytes(32).toString("base64url");
  await mkdir(dir, { recursive: true });
  await writeFile(file, cachedSecret, "utf8");
  return cachedSecret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Hashes a one-time login code. Never store or log the code itself. */
export async function hashLoginCode(email: string, code: string): Promise<string> {
  const secret = await getSecret();
  return createHmac("sha256", secret)
    .update(`${email.trim().toLowerCase()}:${code}`)
    .digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const secret = await getSecret();
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 86_400_000;
  const payload = `${userId}.${expiresAt}`;
  const token = `${payload}.${sign(payload, secret)}`;

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
}

export async function readSession(): Promise<{ userId: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;

  const secret = await getSecret();
  if (!safeEqual(signature, sign(`${userId}.${expiresAt}`, secret))) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;

  return { userId };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Six digits, uniformly distributed. */
export function generateLoginCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
