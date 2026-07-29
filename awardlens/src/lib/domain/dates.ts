import { addDaysIso, daysUntil } from "@/lib/utils";
import type { ObligationCategory, ObligationPriority } from "./types";

/**
 * Date reasoning for obligations.
 *
 * The governing rule: a date is only ever stored when the document supports it.
 * Everything here either validates a model-supplied date against the award's own
 * period, or derives an internal preparation date from a date we already trust.
 */

export interface DatePlausibility {
  plausible: boolean;
  reason: string | null;
}

/** Widest window we will accept around an award period before calling a date suspect. */
const LEAD_GRACE_DAYS = 400;
const TRAIL_GRACE_DAYS = 1100; // closeout, final audits and retention run well past the end

/**
 * Rejects dates that fall implausibly outside the award period. A model that
 * transcribes "2016" for "2026" produces a date that looks perfectly valid in
 * isolation; measured against the grant period it does not.
 */
export function checkDuePlausibility(
  dueDate: string,
  award: { startDate?: string | null; endDate?: string | null },
): DatePlausibility {
  const { startDate, endDate } = award;
  if (!startDate && !endDate) return { plausible: true, reason: null };

  if (startDate) {
    const beforeStart = daysUntil(startDate, isoToDate(dueDate));
    if (beforeStart !== null && beforeStart > LEAD_GRACE_DAYS) {
      return {
        plausible: false,
        reason: `This date is more than a year before the award period begins (${startDate}).`,
      };
    }
  }

  if (endDate) {
    const afterEnd = daysUntil(dueDate, isoToDate(endDate));
    if (afterEnd !== null && afterEnd > TRAIL_GRACE_DAYS) {
      return {
        plausible: false,
        reason: `This date is far beyond the end of the award period (${endDate}).`,
      };
    }
  }

  return { plausible: true, reason: null };
}

function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * How far ahead of a deadline internal work should start, when the extraction
 * does not supply its own estimate. These reflect how long the work genuinely
 * takes in a small nonprofit, not an arbitrary constant.
 */
export function defaultLeadDays(
  category: ObligationCategory,
  priority: ObligationPriority,
): number {
  const byCategory: Partial<Record<ObligationCategory, number>> = {
    reporting: 21,
    financial: 21,
    closeout: 45,
    audit: 60,
    match_cost_share: 30,
    performance_metric: 21,
    deliverable: 30,
    renewal_continuation: 60,
    prior_approval: 30,
    data_collection: 14,
    communications_branding: 7,
    procurement: 14,
    subrecipient_oversight: 21,
    records_retention: 7,
    insurance: 21,
    participant_eligibility: 14,
  };

  const base = byCategory[category] ?? 14;
  if (priority === "critical") return Math.max(base, 30);
  if (priority === "low") return Math.min(base, 7);
  return base;
}

/**
 * Internal preparation date. Never lands in the past relative to the award
 * start, and never collapses onto the due date itself.
 */
export function computeInternalDueDate(
  dueDate: string | null,
  leadDays: number | null,
  category: ObligationCategory,
  priority: ObligationPriority,
): string | null {
  if (!dueDate) return null;
  const lead = leadDays ?? defaultLeadDays(category, priority);
  if (lead <= 0) return null;
  return addDaysIso(dueDate, -Math.min(lead, 180));
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  return MONTH_NAMES.findIndex((month) => month.startsWith(lower.slice(0, 3)));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export interface FoundDate {
  iso: string;
  text: string;
  index: number;
}

/**
 * Finds explicit calendar dates in a passage.
 *
 * Only fully-specified dates count — a month and year with no day, or a bare
 * year, cannot become a deadline. Ambiguous numeric forms are read as US
 * month/day because award documents in scope are US-issued; anything that would
 * be invalid under that reading is discarded rather than reinterpreted.
 */
export function findDatesInText(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const seen = new Set<string>();

  const push = (iso: string, raw: string, index: number) => {
    // Reject days that do not exist in that month. "February 30, 2027" parses
    // structurally but is not a date, and it must never become a deadline.
    const [year, month, day] = iso.split("-").map(Number);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      return;
    }

    const key = `${iso}@${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ iso, text: raw, index });
  };

  // "January 31, 2027" / "Jan. 31 2027"
  const longForm = /\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
  for (const match of text.matchAll(longForm)) {
    const month = monthIndex(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month === -1 || day < 1 || day > 31 || year < 1990 || year > 2100) continue;
    push(`${year}-${pad(month + 1)}-${pad(day)}`, match[0], match.index ?? 0);
  }

  // "31 January 2027"
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]{2,8})\.?,?\s+(\d{4})\b/g;
  for (const match of text.matchAll(dayFirst)) {
    const day = Number(match[1]);
    const month = monthIndex(match[2]);
    const year = Number(match[3]);
    if (month === -1 || day < 1 || day > 31 || year < 1990 || year > 2100) continue;
    push(`${year}-${pad(month + 1)}-${pad(day)}`, match[0], match.index ?? 0);
  }

  // ISO "2027-01-31"
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const [, year, month, day] = match;
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) continue;
    push(`${year}-${month}-${day}`, match[0], match.index ?? 0);
  }

  // "1/31/2027" — US ordering.
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) continue;
    push(`${year}-${pad(month)}-${pad(day)}`, match[0], match.index ?? 0);
  }

  return found.sort((a, b) => a.index - b.index);
}

export type RecurrenceKind = "annual" | "quarterly" | "monthly" | "semiannual" | "unknown";

/** Classifies free-text recurrence into something a calendar can expand. */
export function classifyRecurrence(recurrence: string | null): RecurrenceKind {
  if (!recurrence) return "unknown";
  const text = recurrence.toLowerCase();
  if (/quarter/.test(text)) return "quarterly";
  if (/semi-?annual|twice a year|biannual|every six months/.test(text)) return "semiannual";
  if (/month/.test(text)) return "monthly";
  if (/annual|yearly|每年|per year/.test(text)) return "annual";
  return "unknown";
}

const MONTHS_BY_KIND: Record<Exclude<RecurrenceKind, "unknown">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function addMonthsIso(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  // Clamp to the last valid day of the target month (31 Jan + 1 month = 28/29 Feb).
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Expands a recurring obligation into concrete dates for the calendar export.
 *
 * Only runs when we have a first due date AND an award end date — without both,
 * inventing a series would be inventing deadlines. Capped so a malformed
 * recurrence can never generate an unbounded series.
 */
export function expandRecurrence(
  firstDueDate: string | null,
  recurrence: string | null,
  awardEndDate: string | null,
  maxOccurrences = 24,
): string[] {
  if (!firstDueDate) return [];
  const kind = classifyRecurrence(recurrence);
  if (kind === "unknown") return firstDueDate ? [firstDueDate] : [];
  if (!awardEndDate) return [firstDueDate];

  const step = MONTHS_BY_KIND[kind];
  const dates: string[] = [];
  let current = firstDueDate;
  // Recurring obligations usually have a final instance shortly after the period ends.
  const horizon = addDaysIso(awardEndDate, 120);

  for (let index = 0; index < maxOccurrences; index += 1) {
    if (current > horizon) break;
    dates.push(current);
    current = addMonthsIso(current, step);
  }

  return dates;
}
