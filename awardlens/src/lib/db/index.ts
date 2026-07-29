import "server-only";

import { getServerConfig } from "@/lib/env";
import * as local from "./local";
import * as postgres from "./postgres";

/**
 * The storage seam.
 *
 * Every caller in the application imports persistence from `@/lib/db` and never
 * from a concrete implementation, so switching backends is this file and
 * nothing else.
 *
 * The choice is made once, from configuration, at module load:
 *   - `DATABASE_URL` set  -> Postgres (see supabase/migrations for the schema)
 *   - otherwise            -> the file-backed store, which is what lets the
 *                             product run with no external services at all
 *
 * Both implementations are imported so TypeScript checks them against each
 * other: if the Postgres adapter ever stops matching the reference store's
 * surface, this file fails to compile. That is deliberate — the parity claim
 * should be enforced by the compiler, not by a comment.
 *
 * The rule an implementation must honour: every read and write is scoped by
 * `organizationId` inside the adapter, not merely by its callers.
 * Authorisation that lives only in the calling layer is one forgotten check
 * away from a cross-tenant leak.
 */
const impl: typeof local =
  getServerConfig().storageMode === "postgres" ? postgres : local;

export const newId = impl.newId;
export const __resetStore = impl.__resetStore;
export const findProfileByEmail = impl.findProfileByEmail;
export const getProfile = impl.getProfile;
export const createProfile = impl.createProfile;
export const updateProfile = impl.updateProfile;
export const getOrganization = impl.getOrganization;
export const isMember = impl.isMember;
export const getOrCreateOrganizationForUser = impl.getOrCreateOrganizationForUser;
export const renameOrganization = impl.renameOrganization;
export const saveLoginCode = impl.saveLoginCode;
export const consumeLoginCode = impl.consumeLoginCode;
export const createAward = impl.createAward;
export const getAward = impl.getAward;
export const listAwards = impl.listAwards;
export const updateAward = impl.updateAward;
export const deleteAward = impl.deleteAward;
export const findAwardByContentHash = impl.findAwardByContentHash;
export const createDocument = impl.createDocument;
export const updateDocument = impl.updateDocument;
export const getDocument = impl.getDocument;
export const listDocuments = impl.listDocuments;
export const deleteDocument = impl.deleteDocument;
export const saveDocumentBytes = impl.saveDocumentBytes;
export const readDocumentBytes = impl.readDocumentBytes;
export const createSegments = impl.createSegments;
export const listSegments = impl.listSegments;
export const createRun = impl.createRun;
export const updateRun = impl.updateRun;
export const getLatestRun = impl.getLatestRun;
export const createObligations = impl.createObligations;
export const listObligations = impl.listObligations;
export const listObligationsForOrganization = impl.listObligationsForOrganization;
export const getObligation = impl.getObligation;
export const updateObligation = impl.updateObligation;
export const deleteObligation = impl.deleteObligation;
export const listCitations = impl.listCitations;
export const replaceReminders = impl.replaceReminders;
export const listDueReminders = impl.listDueReminders;
export const listRemindersForObligation = impl.listRemindersForObligation;
export const markReminder = impl.markReminder;
export const getNotificationPreferences = impl.getNotificationPreferences;
export const setNotificationPreferences = impl.setNotificationPreferences;
export const getSubscription = impl.getSubscription;
export const upsertSubscription = impl.upsertSubscription;
export const claimStripeEvent = impl.claimStripeEvent;
export const recordExport = impl.recordExport;
export const recordAuditEvent = impl.recordAuditEvent;
export const listAuditEvents = impl.listAuditEvents;
export const createAskExchange = impl.createAskExchange;
export const listAskExchanges = impl.listAskExchanges;
export const deleteOrganizationData = impl.deleteOrganizationData;
