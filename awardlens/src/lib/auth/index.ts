import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import type { Organization, Profile } from "@/lib/domain/types";
import * as db from "@/lib/db";
import { readSession } from "./session";

export interface Session {
  profile: Profile;
  organization: Organization;
}

/**
 * The single authorisation entry point.
 *
 * Every server action, route handler and page resolves the caller through here
 * and then scopes its queries by `organization.id`. `cache` deduplicates the
 * lookup within a request without leaking across requests.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const session = await readSession();
  if (!session) return null;

  const profile = await db.getProfile(session.userId);
  if (!profile) return null;

  const organization = await db.getOrCreateOrganizationForUser(
    profile.id,
    defaultOrganizationName(profile.email),
  );

  return { profile, organization };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");
  return session;
}

/*
 * There is deliberately no `assertMembership` helper here.
 *
 * An earlier version exported one, documented as "the belt-and-braces check
 * that makes an insecure direct object reference a 404" — with zero call sites.
 * A documented control that never runs is worse than no control, because it
 * invites the assumption that authorisation is handled somewhere central.
 *
 * It is not. Authorisation lives in the data layer: every read and write helper
 * in `@/lib/db` takes an `organizationId` and enforces it, so an id belonging
 * to another organisation returns null rather than a record. Callers pass
 * `session.organization.id` from `requireSession()`; there is nothing for a
 * caller to forget to call.
 */

function defaultOrganizationName(email: string): string {
  const domain = email.split("@")[1] ?? "";
  const generic = new Set([
    "gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
    "protonmail.com", "aol.com", "me.com", "live.com", "mail.com",
  ]);
  if (!domain || generic.has(domain.toLowerCase())) {
    const local = email.split("@")[0] ?? "My";
    return `${local.charAt(0).toUpperCase()}${local.slice(1)}'s organisation`;
  }
  const bare = domain.split(".")[0] ?? domain;
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}
