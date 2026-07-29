import type { Award, ObligationWithCitations } from "@/lib/domain/types";
import { CATEGORY_META, INTERPRETATION_LABELS, REVIEW_STATUS_LABELS, SOURCE_STATUS_LABELS } from "@/lib/domain/types";
import { formatLocatorShort } from "@/lib/documents/segment";

/**
 * RFC 4180 quoting, plus neutralisation of spreadsheet formula injection.
 *
 * Award documents contain text we did not write. A cell beginning `=`, `+`, `-`
 * or `@` is executed as a formula by Excel and Sheets on open, so those cells
 * are prefixed with an apostrophe — the value still reads correctly, but it can
 * never run.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

const HEADERS = [
  "Title",
  "Category",
  "Description",
  "Due date",
  "Original date wording",
  "Recurrence",
  "Start work by",
  "Suggested owner",
  "Priority",
  "Review status",
  "Basis",
  "Confidence",
  "Source status",
  "Source locations",
  "Source excerpt",
  "Consequence",
  "Question for funder",
  "Notes",
];

export function obligationsToCsv(award: Award, obligations: ObligationWithCitations[]): string {
  const rows: unknown[][] = [
    [`AwardLens obligation register — ${award.name}`],
    [
      `Funder: ${award.funder ?? "Not stated"}`,
      `Award number: ${award.awardNumber ?? "Not stated"}`,
      `Period: ${award.startDate ?? "?"} to ${award.endDate ?? "?"}`,
    ],
    [
      "Every row below was extracted by AwardLens and must be verified against the award document. AwardLens does not provide legal, accounting or compliance advice.",
    ],
    [],
    HEADERS,
  ];

  for (const obligation of obligations) {
    const locators = obligation.citations
      .filter((citation) => citation.documentSegmentId)
      .map((citation) => formatLocatorShort(citation.locatorType, citation.locatorValue))
      .join("; ");

    rows.push([
      obligation.title,
      CATEGORY_META[obligation.category].label,
      obligation.description,
      obligation.dueDate ?? "",
      obligation.originalDateText ?? "",
      obligation.recurrence ?? "",
      obligation.internalDueDate ?? "",
      obligation.suggestedOwnerRole ?? "",
      obligation.priority,
      REVIEW_STATUS_LABELS[obligation.reviewStatus],
      INTERPRETATION_LABELS[obligation.interpretationLevel],
      obligation.confidence.toFixed(2),
      SOURCE_STATUS_LABELS[obligation.sourceStatus],
      locators,
      obligation.citations[0]?.excerpt ?? "",
      obligation.consequence ?? "",
      obligation.clarificationQuestion ?? "",
      obligation.notes ?? "",
    ]);
  }

  return toCsv(rows);
}
