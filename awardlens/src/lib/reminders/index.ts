import "server-only";

import type { Obligation, Reminder } from "@/lib/domain/types";
import { addDaysIso, formatIsoDate, toIsoDate } from "@/lib/utils";
import * as db from "@/lib/db";
import { canUseReminders } from "@/lib/billing/plans";
import { escapeHtml, renderEmailShell, sendEmail } from "@/lib/email";
import { getServerConfig } from "@/lib/env";
import type { Session } from "@/lib/auth";

/**
 * Reminder scheduling.
 *
 * Two rules keep this trustworthy:
 *  - Only CONFIRMED, dated obligations generate reminders. We will not email
 *    someone about a deadline a person has not yet verified.
 *  - The idempotency key binds the obligation, the due date, the offset and the
 *    recipient, so re-running the scheduler is a no-op and changing a due date
 *    retires the old schedule rather than duplicating it.
 */

export function reminderIdempotencyKey(
  obligationId: string,
  dueDate: string,
  offsetDays: number,
  userId: string,
): string {
  return `${obligationId}:${dueDate}:${offsetDays}:${userId}`;
}

export async function syncRemindersForObligation(
  session: Session,
  obligation: Obligation,
): Promise<void> {
  const organizationId = session.organization.id;

  const eligible =
    obligation.reviewStatus === "confirmed" &&
    Boolean(obligation.dueDate) &&
    obligation.organizationId === organizationId;

  if (!eligible) {
    await db.replaceReminders(obligation.id, []);
    return;
  }

  const subscription = await db.getSubscription(organizationId);
  if (!canUseReminders(subscription)) {
    await db.replaceReminders(obligation.id, []);
    return;
  }

  const preferences = await db.getNotificationPreferences(session.profile.id, organizationId);
  if (!preferences.enabled || preferences.offsets.length === 0) {
    await db.replaceReminders(obligation.id, []);
    return;
  }

  const dueDate = obligation.dueDate as string;
  const today = toIsoDate(new Date());

  const reminders: Omit<Reminder, "id" | "createdAt">[] = preferences.offsets
    .map((offsetDays) => ({ offsetDays, scheduledFor: addDaysIso(dueDate, -offsetDays) }))
    // A reminder for a date that has already passed would fire immediately.
    .filter((entry) => entry.scheduledFor >= today)
    .map((entry) => ({
      obligationId: obligation.id,
      organizationId,
      userId: session.profile.id,
      offsetDays: entry.offsetDays,
      scheduledFor: entry.scheduledFor,
      sentAt: null,
      status: "scheduled" as const,
      idempotencyKey: reminderIdempotencyKey(
        obligation.id,
        dueDate,
        entry.offsetDays,
        session.profile.id,
      ),
      lastError: null,
    }));

  await db.replaceReminders(obligation.id, reminders);
}

export interface ReminderRunSummary {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Processes reminders due today. Safe to run repeatedly: each reminder is
 * re-validated against live data and marked terminally before or after sending.
 */
export async function processDueReminders(
  today = toIsoDate(new Date()),
): Promise<ReminderRunSummary> {
  const due = await db.listDueReminders(today);
  const summary: ReminderRunSummary = {
    considered: due.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const config = getServerConfig();

  for (const reminder of due) {
    const obligation = await db.getObligation(reminder.obligationId, reminder.organizationId);

    // Re-verify: the obligation may have been deleted, unconfirmed, or re-dated
    // since this reminder was scheduled.
    if (!obligation || obligation.reviewStatus !== "confirmed" || !obligation.dueDate) {
      await db.markReminder(reminder.id, { status: "cancelled" });
      summary.skipped += 1;
      continue;
    }

    const expectedKey = reminderIdempotencyKey(
      obligation.id,
      obligation.dueDate,
      reminder.offsetDays,
      reminder.userId,
    );
    if (expectedKey !== reminder.idempotencyKey) {
      await db.markReminder(reminder.id, { status: "cancelled" });
      summary.skipped += 1;
      continue;
    }

    const [profile, award] = await Promise.all([
      db.getProfile(reminder.userId),
      db.getAward(obligation.awardId, reminder.organizationId),
    ]);
    if (!profile || !award) {
      await db.markReminder(reminder.id, { status: "cancelled" });
      summary.skipped += 1;
      continue;
    }

    const link = `${config.appUrl}/app/awards/${award.id}/obligations#obligation-${obligation.id}`;
    const result = await sendEmail({
      to: profile.email,
      subject: `${obligation.title} is due ${formatIsoDate(obligation.dueDate, { month: "long", day: "numeric" })} — ${award.name}`,
      html: renderEmailShell(
        obligation.title,
        `<p><strong>${escapeHtml(award.name)}</strong></p>
         <p>Due <strong>${escapeHtml(formatIsoDate(obligation.dueDate))}</strong> — that is ${reminder.offsetDays} ${reminder.offsetDays === 1 ? "day" : "days"} from now.</p>
         ${obligation.internalDueDate ? `<p>Suggested start date: ${escapeHtml(formatIsoDate(obligation.internalDueDate))}</p>` : ""}
         ${obligation.suggestedOwnerRole ? `<p>Suggested owner: ${escapeHtml(obligation.suggestedOwnerRole)}</p>` : ""}
         <p style="margin-top:20px;"><a href="${escapeHtml(link)}" style="background:#0f5c4a;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Open in AwardLens</a></p>`,
        // Source excerpts stay out of email by default — they are award content.
        "This reminder covers an obligation you confirmed in AwardLens. Open the award to see the source passage it came from.",
      ),
      text: `${obligation.title}\n${award.name}\nDue ${obligation.dueDate} (${reminder.offsetDays} days from now)\n\n${link}`,
    });

    if (result.ok) {
      await db.markReminder(reminder.id, {
        status: "sent",
        sentAt: new Date().toISOString(),
        lastError: null,
      });
      summary.sent += 1;
    } else {
      // Left in "scheduled" so the next run retries; the error is recorded.
      await db.markReminder(reminder.id, { lastError: result.error.slice(0, 300) });
      summary.failed += 1;
    }
  }

  return summary;
}
