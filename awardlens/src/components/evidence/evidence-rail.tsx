import { AlertTriangle, FileWarning, Quote, ShieldCheck } from "lucide-react";

import {
  CATEGORY_META,
  INTERPRETATION_LABELS,
  PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
  SOURCE_STATUS_LABELS,
  type ObligationWithCitations,
} from "@/lib/domain/types";
import { formatLocator } from "@/lib/documents/segment";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn, daysUntil, formatIsoDate, truncate } from "@/lib/utils";

/**
 * The Evidence Rail — AwardLens's signature surface.
 *
 * It exists to make one relationship impossible to miss: this obligation came
 * from that passage. Provenance is not a detail tucked behind a link; it sits in
 * the same block as the claim, and when we could not verify it the component
 * says so instead of quietly showing nothing.
 *
 * The design carries that argument in three moves:
 *
 *  1. The claim is set as an editorial unit — eyebrow, title, timing, then the
 *     plain-English restatement — with one clear reading order.
 *  2. The source is a *document object*: a warm paper panel, Source Serif at
 *     reading size in warm ink, a hanging quotation mark, and a mono locator.
 *     It should look like something scanned in, not like another UI card.
 *  3. Everything that qualifies the claim — verification, basis, confidence,
 *     suggested owner — lives inside that same panel, under a hairline. How
 *     sure we are belongs with where it came from, not in a separate badge
 *     rack at the top of the card.
 *
 * The badge economy is deliberate. In a queue of thirty items, twenty-nine say
 * "Needs review" and "Source verified"; a filled pill on every row is ink spent
 * to say nothing, and it trains people to stop reading the column. Those states
 * are rendered quiet — a coloured marker and plain text, same words, same
 * accessible name — and the loud treatment is reserved for the exceptions:
 * unverified sources, conflicting dates, critical priority, low confidence.
 */

/** Bands where the model is not confident enough to be quiet about it. */
const CONFIDENCE_ATTENTION = 0.6;

/**
 * Joins inline metadata with hairline separators.
 *
 * The separators are real elements rather than a CSS `::before`, because some
 * of these items are pills with their own `::before` marker, and because an
 * `aria-hidden` span keeps "middle dot" out of the screen-reader stream. Nulls
 * are dropped first so an absent item never leaves a dangling dot.
 */
function separated(nodes: React.ReactNode[]): React.ReactNode[] {
  const present = nodes.filter(Boolean);
  return present.flatMap((node, index) =>
    index === 0
      ? [node]
      : [
          <span key={`sep-${index}`} aria-hidden="true" className="text-border-strong">
            ·
          </span>,
          node,
        ],
  );
}

export function ConfidenceBadge({
  confidence,
  emphasis,
}: {
  confidence: number;
  emphasis?: BadgeProps["emphasis"];
}) {
  const band =
    confidence >= 0.8 ? "High" : confidence >= 0.6 ? "Medium" : confidence >= 0.4 ? "Low" : "Very low";
  const variant = confidence >= 0.8 ? "neutral" : confidence >= 0.6 ? "outline" : "warning";
  return (
    <Badge
      variant={variant}
      emphasis={emphasis ?? (confidence < CONFIDENCE_ATTENTION ? "solid" : "bare")}
      title={`Model confidence ${(confidence * 100).toFixed(0)}%`}
    >
      {band} confidence
    </Badge>
  );
}

export function ReviewStatusBadge({
  status,
  emphasis,
}: {
  status: ObligationWithCitations["reviewStatus"];
  emphasis?: BadgeProps["emphasis"];
}) {
  const variant =
    status === "confirmed"
      ? "success"
      : status === "needs_clarification"
        ? "warning"
        : status === "not_applicable" || status === "archived"
          ? "neutral"
          : "ink";

  /*
   * "Needs review" is the state everything starts in, so it is quiet by
   * default — a marker dot and the words, nothing more. "Confirmed" and "Needs
   * clarification" are the states a person put an item into, and those are
   * worth a filled pill: they are the two outcomes anyone is scanning for.
   */
  const defaultEmphasis: BadgeProps["emphasis"] =
    status === "confirmed" || status === "needs_clarification" ? "solid" : "quiet";

  return (
    <Badge variant={variant} emphasis={emphasis ?? defaultEmphasis}>
      {REVIEW_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SourceStatusBadge({
  status,
  emphasis,
}: {
  status: ObligationWithCitations["sourceStatus"];
  emphasis?: BadgeProps["emphasis"];
}) {
  if (status === "verified") {
    /* The expected case. A tick and the words; no pill, no fill. */
    return (
      <Badge variant="success" emphasis={emphasis ?? "bare"}>
        <ShieldCheck className="size-3" aria-hidden="true" />
        {SOURCE_STATUS_LABELS.verified}
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge variant="warning" emphasis={emphasis ?? "solid"}>
        <AlertTriangle className="size-3" aria-hidden="true" />
        {SOURCE_STATUS_LABELS.partial}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" emphasis={emphasis ?? "solid"}>
      <FileWarning className="size-3" aria-hidden="true" />
      {SOURCE_STATUS_LABELS.unverified}
    </Badge>
  );
}

export function DueDateLine({
  dueDate,
  originalDateText,
  recurrence,
}: {
  dueDate: string | null;
  originalDateText: string | null;
  recurrence: string | null;
}) {
  if (!dueDate) {
    return (
      <p className="text-sm text-muted-foreground">
        {originalDateText ? (
          <>
            Timing:{" "}
            <span className="text-foreground-soft">&ldquo;{originalDateText}&rdquo;</span>{" "}
            <span className="text-xs">(no fixed calendar date)</span>
          </>
        ) : (
          <>No due date stated in the document</>
        )}
        {recurrence ? <span className="text-xs"> · repeats {recurrence}</span> : null}
      </p>
    );
  }

  const days = daysUntil(dueDate);
  const overdue = days !== null && days < 0;
  const soon = days !== null && days >= 0 && days <= 30;

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="font-medium tracking-[-0.008em] text-foreground">
        Due {formatIsoDate(dueDate)}
      </span>
      {days !== null ? (
        <span
          className={cn(
            "tabular rounded-sm px-1.5 py-px font-mono text-[11px] font-medium",
            overdue
              ? "bg-destructive-subtle text-destructive"
              : soon
                ? "bg-warning-subtle text-warning"
                : "text-muted-foreground",
          )}
        >
          {overdue
            ? `${Math.abs(days)} days overdue`
            : days === 0
              ? "today"
              : `in ${days} days`}
        </span>
      ) : null}
      {recurrence ? (
        <span className="text-xs text-muted-foreground">· repeats {recurrence}</span>
      ) : null}
    </p>
  );
}

interface EvidenceRailProps {
  obligation: ObligationWithCitations;
  /** Rendered by the caller so this component stays server-compatible. */
  actions?: React.ReactNode;
  onOpenSourceHref?: string;
  compact?: boolean;
  /**
   * The item currently being reviewed. Raises it off the page and rings it, so
   * one card in a long queue is unmistakably the one you are working on.
   */
  selected?: boolean;
  /** Override the resting elevation — e.g. `flat` inside another card. */
  elevation?: "flat" | "resting" | "raised";
  className?: string;
}

export function EvidenceRail({
  obligation,
  actions,
  onOpenSourceHref,
  compact = false,
  selected = false,
  elevation,
  className,
}: EvidenceRailProps) {
  const meta = CATEGORY_META[obligation.category];
  const primaryCitation =
    obligation.citations.find((citation) => citation.documentSegmentId) ?? obligation.citations[0];
  const isMachineWritten = obligation.origin !== "manual";
  const unconfirmed = obligation.reviewStatus === "needs_review";
  const hasCitation = Boolean(primaryCitation && primaryCitation.documentSegmentId);
  const alsoCited = obligation.citations.filter((citation) => citation.documentSegmentId).slice(1);
  const level = elevation ?? (selected ? "raised" : "resting");

  return (
    <article
      className={cn(
        "relative rounded-lg border border-border bg-surface",
        level === "raised" ? "shadow-raised" : level === "resting" ? "shadow-resting" : "",
        selected && "ring-1 ring-primary/20",
        // The rail itself: a coloured spine keyed to whether a human has signed off.
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg",
        obligation.reviewStatus === "confirmed"
          ? "before:bg-success"
          : obligation.sourceStatus === "unverified"
            ? "before:bg-destructive"
            : unconfirmed
              ? "before:bg-ink-accent"
              : "before:bg-border-strong",
        className,
      )}
      aria-labelledby={`obligation-${obligation.id}-title`}
    >
      <div className={cn("pl-5 pr-4", compact ? "py-3.5" : "py-4")}>
        {/*
          Header line. The category is an eyebrow rather than a filled pill:
          it is a label for what follows, and thirteen evergreen pills down a
          register page is a texture, not a signal.
        */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="eyebrow text-primary">{meta.label}</span>
          {obligation.priority === "critical" || obligation.priority === "high" ? (
            <Badge
              variant={obligation.priority === "critical" ? "destructive" : "warning"}
              emphasis={obligation.priority === "critical" ? "solid" : "quiet"}
            >
              {PRIORITY_LABELS[obligation.priority]} priority
            </Badge>
          ) : null}
          <span className="ml-auto">
            <ReviewStatusBadge status={obligation.reviewStatus} />
          </span>
        </div>

        <h3
          id={`obligation-${obligation.id}-title`}
          className={cn(
            "mt-2 text-foreground",
            compact
              ? "text-[15px] font-semibold leading-snug tracking-[-0.011em]"
              : "type-subhead",
          )}
        >
          {obligation.title}
        </h3>

        <div className="mt-1.5">
          <DueDateLine
            dueDate={obligation.dueDate}
            originalDateText={obligation.originalDateText}
            recurrence={obligation.recurrence}
          />
        </div>

        {!compact ? (
          <p className="type-body mt-2.5 max-w-[62ch] text-foreground-soft">
            {obligation.description}
          </p>
        ) : null}

        {obligation.dateConflicts.length > 1 ? (
          <div className="mt-3 rounded-md border border-warning-border bg-warning-subtle px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              The document gives more than one date for this requirement
            </p>
            <ul className="mt-1.5 space-y-1">
              {obligation.dateConflicts.map((conflict, index) => (
                <li
                  key={index}
                  className="text-xs leading-relaxed text-warning"
                >
                  <span className="tabular font-mono font-medium">
                    {conflict.normalizedDate ?? "—"}
                  </span>
                  {" — "}
                  &ldquo;{truncate(conflict.dateText, 70)}&rdquo;
                  {conflict.locatorValue
                    ? ` (${formatLocator(conflict.locatorType, conflict.locatorValue)})`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/*
          The provenance panel — always rendered, even when we failed to verify.
          Paper-toned and bordered so it reads as a piece of the document that
          has been lifted into the card, rather than as more interface.
        */}
        <div className="mt-3.5 overflow-hidden rounded-md border border-paper-border bg-paper">
          {hasCitation && primaryCitation ? (
            <figure>
              <figcaption className="flex items-center gap-1.5 px-4 pb-1.5 pt-2.5">
                <Quote className="size-3 shrink-0 text-highlight-rule" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  <span className="type-caption text-ink-document-soft">Source: </span>
                  <span className="font-mono text-[11.5px] font-medium tracking-[-0.01em] text-ink-document">
                    {formatLocator(primaryCitation.locatorType, primaryCitation.locatorValue)}
                  </span>
                </span>
              </figcaption>
              {/* The opening quotation mark hangs into the gutter so the first
                  letter lines up with the panel's text edge, as it would in
                  print. */}
              <blockquote className="evidence-quote evidence-quote-hang max-w-[64ch] px-4 pb-3">
                &ldquo;{truncate(primaryCitation.excerpt, compact ? 180 : 340)}&rdquo;
              </blockquote>
            </figure>
          ) : (
            <p className="flex items-start gap-2 px-4 py-3 text-xs leading-relaxed text-destructive">
              <FileWarning className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>
                We could not match this item to a passage in your document. Check it against the
                award before relying on it.
              </span>
            </p>
          )}

          {alsoCited.length > 0 ? (
            <p className="px-4 pb-2.5 text-xs text-ink-document-soft">
              Also cited at{" "}
              {alsoCited
                .map((citation) => formatLocator(citation.locatorType, citation.locatorValue))
                .join(", ")}
            </p>
          ) : null}

          {/*
            How far to trust the passage above, attached to the passage above.
            Quiet by default: this line is identical on most items, and it only
            earns colour when something is actually off.
          */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-paper-border/70 bg-paper px-4 py-2 text-xs">
            {separated([
              <SourceStatusBadge key="source" status={obligation.sourceStatus} />,
              <Badge key="basis" variant="neutral" emphasis="bare">
                {isMachineWritten
                  ? INTERPRETATION_LABELS[obligation.interpretationLevel]
                  : "Added by you"}
              </Badge>,
              isMachineWritten ? (
                <ConfidenceBadge key="confidence" confidence={obligation.confidence} />
              ) : null,
              obligation.suggestedOwnerRole ? (
                <span key="owner" className="text-xs text-ink-document-soft">
                  Suggested owner: {obligation.suggestedOwnerRole}
                </span>
              ) : null,
            ])}
          </div>
        </div>

        {obligation.clarificationQuestion ? (
          <p className="mt-3 rounded-md border border-border-subtle bg-muted px-3 py-2.5 text-xs leading-relaxed text-foreground-soft">
            <span className="font-semibold">Question for the funder: </span>
            {obligation.clarificationQuestion}
          </p>
        ) : null}

        {obligation.notes ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold">Your note: </span>
            {obligation.notes}
          </p>
        ) : null}

        {actions || onOpenSourceHref ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" data-print="hide">
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}
