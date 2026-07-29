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
import { Badge } from "@/components/ui/badge";
import { cn, daysUntil, formatIsoDate, truncate } from "@/lib/utils";

/**
 * The Evidence Rail — AwardLens's signature surface.
 *
 * It exists to make one relationship impossible to miss: this obligation came
 * from that passage. Provenance is not a detail tucked behind a link; it sits in
 * the same block as the claim, and when we could not verify it the component
 * says so instead of quietly showing nothing.
 */

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const band =
    confidence >= 0.8 ? "High" : confidence >= 0.6 ? "Medium" : confidence >= 0.4 ? "Low" : "Very low";
  const variant = confidence >= 0.8 ? "neutral" : confidence >= 0.6 ? "outline" : "warning";
  return (
    <Badge variant={variant} title={`Model confidence ${(confidence * 100).toFixed(0)}%`}>
      {band} confidence
    </Badge>
  );
}

export function ReviewStatusBadge({
  status,
}: {
  status: ObligationWithCitations["reviewStatus"];
}) {
  const variant =
    status === "confirmed"
      ? "success"
      : status === "needs_clarification"
        ? "warning"
        : status === "not_applicable" || status === "archived"
          ? "neutral"
          : "ink";
  return <Badge variant={variant}>{REVIEW_STATUS_LABELS[status]}</Badge>;
}

export function SourceStatusBadge({
  status,
}: {
  status: ObligationWithCitations["sourceStatus"];
}) {
  if (status === "verified") {
    return (
      <Badge variant="neutral">
        <ShieldCheck className="size-3" aria-hidden="true" />
        {SOURCE_STATUS_LABELS.verified}
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge variant="warning">
        <AlertTriangle className="size-3" aria-hidden="true" />
        {SOURCE_STATUS_LABELS.partial}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
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
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="font-medium text-foreground">Due {formatIsoDate(dueDate)}</span>
      {days !== null ? (
        <span
          className={cn(
            "font-mono text-xs",
            overdue ? "text-destructive" : soon ? "text-warning" : "text-muted-foreground",
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
  className?: string;
}

export function EvidenceRail({
  obligation,
  actions,
  onOpenSourceHref,
  compact = false,
  className,
}: EvidenceRailProps) {
  const meta = CATEGORY_META[obligation.category];
  const primaryCitation =
    obligation.citations.find((citation) => citation.documentSegmentId) ?? obligation.citations[0];
  const isMachineWritten = obligation.origin !== "manual";
  const unconfirmed = obligation.reviewStatus === "needs_review";

  return (
    <article
      className={cn(
        "relative rounded-lg border border-border bg-surface",
        // The rail itself: a coloured spine keyed to whether a human has signed off.
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-lg",
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">{meta.label}</Badge>
          {obligation.priority === "critical" || obligation.priority === "high" ? (
            <Badge variant={obligation.priority === "critical" ? "destructive" : "warning"}>
              {PRIORITY_LABELS[obligation.priority]} priority
            </Badge>
          ) : null}
          <ReviewStatusBadge status={obligation.reviewStatus} />
        </div>

        <h3
          id={`obligation-${obligation.id}-title`}
          className="mt-2.5 text-[15px] font-semibold leading-snug text-foreground"
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
          <p className="mt-2.5 text-sm leading-relaxed text-foreground-soft">
            {obligation.description}
          </p>
        ) : null}

        {obligation.dateConflicts.length > 1 ? (
          <div className="mt-3 rounded-md border border-warning-border bg-warning-subtle px-3 py-2">
            <p className="text-xs font-semibold text-warning">
              The document gives more than one date for this requirement
            </p>
            <ul className="mt-1 space-y-0.5">
              {obligation.dateConflicts.map((conflict, index) => (
                <li key={index} className="text-xs text-warning">
                  <span className="font-mono">{conflict.normalizedDate ?? "—"}</span>
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

        {/* Provenance block — always rendered, even when we failed to verify. */}
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <SourceStatusBadge status={obligation.sourceStatus} />
            {isMachineWritten ? (
              <Badge variant="outline">{INTERPRETATION_LABELS[obligation.interpretationLevel]}</Badge>
            ) : (
              <Badge variant="outline">Added by you</Badge>
            )}
            {isMachineWritten ? <ConfidenceBadge confidence={obligation.confidence} /> : null}
            {obligation.suggestedOwnerRole ? (
              <span className="text-xs text-muted-foreground">
                Suggested owner: {obligation.suggestedOwnerRole}
              </span>
            ) : null}
          </div>

          {primaryCitation && primaryCitation.documentSegmentId ? (
            <figure className="mt-2.5">
              <figcaption className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Quote className="size-3" aria-hidden="true" />
                Source: {formatLocator(primaryCitation.locatorType, primaryCitation.locatorValue)}
              </figcaption>
              <blockquote className="evidence-quote mt-1 border-l-2 border-border-strong pl-3">
                &ldquo;{truncate(primaryCitation.excerpt, compact ? 180 : 340)}&rdquo;
              </blockquote>
            </figure>
          ) : (
            <p className="mt-2.5 text-xs leading-relaxed text-destructive">
              We could not match this item to a passage in your document. Check it against the
              award before relying on it.
            </p>
          )}

          {obligation.citations.filter((citation) => citation.documentSegmentId).length > 1 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Also cited at{" "}
              {obligation.citations
                .filter((citation) => citation.documentSegmentId)
                .slice(1)
                .map((citation) => formatLocator(citation.locatorType, citation.locatorValue))
                .join(", ")}
            </p>
          ) : null}
        </div>

        {obligation.clarificationQuestion ? (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-foreground-soft">
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
          <div className="mt-3.5 flex flex-wrap items-center gap-2" data-print="hide">
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}
