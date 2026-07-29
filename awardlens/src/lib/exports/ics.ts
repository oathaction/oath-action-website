import type { Award, ObligationWithCitations } from "@/lib/domain/types";
import { CATEGORY_META } from "@/lib/domain/types";
import { expandRecurrence } from "@/lib/domain/dates";
import { formatLocator } from "@/lib/documents/segment";

/** RFC 5545 text escaping. Order matters — backslashes first. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 requires lines of at most 75 octets, continued with a leading space. */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte character.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    chunks.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }

  return chunks.join("\r\n ");
}

function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function addOneDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export interface IcsOptions {
  /** Only confirmed obligations belong in someone's calendar by default. */
  includeUnconfirmed?: boolean;
  appUrl?: string;
  /** Injected so output is deterministic in tests. */
  stamp?: string;
}

/**
 * Builds an all-day VEVENT per dated obligation, plus one for the internal
 * preparation date. Recurring obligations are expanded into explicit dates
 * rather than using RRULE: the underlying rules come from prose like "within 30
 * days of each quarter end", and an expanded series we can show the user is
 * safer than an RRULE that silently means something slightly different.
 */
export function obligationsToIcs(
  award: Award,
  obligations: ObligationWithCitations[],
  options: IcsOptions = {},
): string {
  const stamp = options.stamp ?? `${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AwardLens//Obligation Register//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`${award.name} — deadlines`)}`,
  ];

  const eligible = obligations.filter((obligation) => {
    if (obligation.reviewStatus === "not_applicable" || obligation.reviewStatus === "archived") {
      return false;
    }
    if (!options.includeUnconfirmed && obligation.reviewStatus !== "confirmed") return false;
    return Boolean(obligation.dueDate);
  });

  for (const obligation of eligible) {
    const dates = expandRecurrence(obligation.dueDate, obligation.recurrence, award.endDate);

    dates.forEach((date, index) => {
      const locators = obligation.citations
        .filter((citation) => citation.documentSegmentId)
        .map((citation) => formatLocator(citation.locatorType, citation.locatorValue))
        .join(", ");

      const descriptionParts = [
        obligation.description,
        obligation.originalDateText ? `Award wording: ${obligation.originalDateText}` : null,
        obligation.suggestedOwnerRole ? `Suggested owner: ${obligation.suggestedOwnerRole}` : null,
        locators ? `Source: ${locators}` : "Source: confirmation needed",
        obligation.reviewStatus === "confirmed"
          ? null
          : "NOT YET CONFIRMED — verify against the award document.",
        options.appUrl ? `Open in AwardLens: ${options.appUrl}` : null,
      ].filter(Boolean);

      lines.push(
        "BEGIN:VEVENT",
        `UID:${obligation.id}-${index}@awardlens`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcsDate(date)}`,
        `DTEND;VALUE=DATE:${addOneDay(date)}`,
        `SUMMARY:${escapeIcsText(`${obligation.title} — ${award.name}`)}`,
        `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`,
        `CATEGORIES:${escapeIcsText(CATEGORY_META[obligation.category].label)}`,
        obligation.reviewStatus === "confirmed" ? "STATUS:CONFIRMED" : "STATUS:TENTATIVE",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    });

    if (obligation.internalDueDate && dates.length > 0) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${obligation.id}-prep@awardlens`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcsDate(obligation.internalDueDate)}`,
        `DTEND;VALUE=DATE:${addOneDay(obligation.internalDueDate)}`,
        `SUMMARY:${escapeIcsText(`Start work: ${obligation.title} — ${award.name}`)}`,
        `DESCRIPTION:${escapeIcsText(
          `Internal preparation date for "${obligation.title}", due ${obligation.dueDate}.`,
        )}`,
        "STATUS:TENTATIVE",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
}
