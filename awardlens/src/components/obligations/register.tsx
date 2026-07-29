"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileWarning,
  LayoutList,
  PenLine,
  Quote,
  RotateCcw,
  Search,
  Table2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { deleteObligationAction, setReviewStatusAction } from "@/app/actions/obligations";
import { AddObligationDialog } from "@/components/obligations/add-obligation-dialog";
import { ConfidenceBadge, ReviewStatusBadge } from "@/components/evidence/evidence-rail";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonRow } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, Input, Label, NativeSelect } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { formatLocator, formatLocatorShort } from "@/lib/documents/segment";
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_META,
  INTERPRETATION_LABELS,
  OBLIGATION_CATEGORIES,
  OBLIGATION_PRIORITIES,
  PRIORITY_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  SOURCE_STATUS_LABELS,
  type Award,
  type CategoryGroup,
  type ObligationCategory,
  type ObligationPriority,
  type ObligationWithCitations,
  type ReviewStatus,
} from "@/lib/domain/types";
import { cn, daysUntil, formatIsoDate, truncate } from "@/lib/utils";

/* ------------------------------------------------------------------ types */

type DateFilter = "all" | "overdue" | "next30" | "next90" | "dated" | "undated";
type SortKey = "due" | "priority" | "confidence" | "status" | "category";
type SortDirection = "asc" | "desc";
type ViewMode = "cards" | "table";

interface Filters {
  query: string;
  category: string;
  status: string;
  priority: string;
  date: DateFilter;
  owner: string;
}

const NO_OWNER = "__none__";

const DEFAULT_FILTERS: Filters = {
  query: "",
  category: "all",
  status: "all",
  priority: "all",
  date: "all",
  owner: "all",
};

const GROUP_ORDER: CategoryGroup[] = ["deadlines", "money", "programmatic", "compliance"];

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: "Any date",
  overdue: "Overdue",
  next30: "Next 30 days",
  next90: "Next 90 days",
  dated: "Has a date",
  undated: "No date stated",
};

const SORT_LABELS: Record<SortKey, string> = {
  due: "Due date",
  priority: "Priority",
  confidence: "Confidence",
  status: "Review status",
  category: "Category",
};

/** What "ascending" means for each sort, spelled out for the direction toggle. */
const SORT_DIRECTION_LABELS: Record<SortKey, Record<SortDirection, string>> = {
  due: { asc: "soonest first", desc: "latest first" },
  priority: { asc: "most urgent first", desc: "least urgent first" },
  confidence: { asc: "lowest first", desc: "highest first" },
  status: { asc: "needs review first", desc: "settled first" },
  category: { asc: "A to Z", desc: "Z to A" },
};

const PRIORITY_RANK: Record<ObligationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_RANK: Record<ReviewStatus, number> = {
  needs_review: 0,
  needs_clarification: 1,
  confirmed: 2,
  not_applicable: 3,
  archived: 4,
};

const CATEGORY_RANK: Record<ObligationCategory, number> = Object.fromEntries(
  OBLIGATION_CATEGORIES.map((category) => [
    category,
    GROUP_ORDER.indexOf(CATEGORY_META[category].group) * 100 +
      OBLIGATION_CATEGORIES.indexOf(category),
  ]),
) as Record<ObligationCategory, number>;

/* -------------------------------------------------------------- utilities */

function searchIndex(obligation: ObligationWithCitations): string {
  return [
    obligation.title,
    obligation.description,
    obligation.suggestedOwnerRole ?? "",
    obligation.originalDateText ?? "",
    ...obligation.citations.map((citation) => citation.excerpt),
  ]
    .join(" | ")
    .toLowerCase();
}

function compareObligations(
  a: ObligationWithCitations,
  b: ObligationWithCitations,
  key: SortKey,
  direction: SortDirection,
): number {
  const flip = direction === "asc" ? 1 : -1;
  const byTitle = a.title.localeCompare(b.title);

  switch (key) {
    case "due": {
      // Undated items always sit at the end: reversing the sort must not push
      // "no date stated" above a real deadline.
      if (!a.dueDate && !b.dueDate) return byTitle;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const cmp = a.dueDate.localeCompare(b.dueDate);
      return cmp !== 0 ? cmp * flip : byTitle;
    }
    case "priority": {
      const cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return cmp !== 0 ? cmp * flip : byTitle;
    }
    case "confidence": {
      const cmp = a.confidence - b.confidence;
      return cmp !== 0 ? cmp * flip : byTitle;
    }
    case "status": {
      const cmp = STATUS_RANK[a.reviewStatus] - STATUS_RANK[b.reviewStatus];
      return cmp !== 0 ? cmp * flip : byTitle;
    }
    case "category": {
      const cmp = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
      return cmp !== 0 ? cmp * flip : byTitle;
    }
  }
}

function matchesDateFilter(obligation: ObligationWithCitations, filter: DateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "dated") return obligation.dueDate !== null;
  if (filter === "undated") return obligation.dueDate === null;

  const days = daysUntil(obligation.dueDate);
  if (days === null) return false;
  if (filter === "overdue") return days < 0;
  if (filter === "next30") return days >= 0 && days <= 30;
  return days >= 0 && days <= 90;
}

/** The citation we would actually show a user, if any survived verification. */
function citedLocator(obligation: ObligationWithCitations): string | null {
  const cited = obligation.citations.find((citation) => citation.documentSegmentId);
  return cited ? formatLocatorShort(cited.locatorType, cited.locatorValue) : null;
}

/**
 * The coloured spine, keyed to whether a person has signed off — the same
 * keying the Evidence Rail and the table use, so all three views agree at a
 * glance. Every state it encodes is also stated in words on the row.
 */
function spineTone(obligation: ObligationWithCitations): string {
  if (obligation.reviewStatus === "confirmed") return "bg-success";
  if (obligation.sourceStatus === "unverified") return "bg-destructive";
  if (obligation.reviewStatus === "needs_review") return "bg-ink-accent";
  return "bg-border-strong";
}

/** The same keying as a left border, for the table, where a cell is the row. */
function spineBorder(obligation: ObligationWithCitations): string {
  if (obligation.reviewStatus === "confirmed") return "border-l-success";
  if (obligation.sourceStatus === "unverified") return "border-l-destructive";
  if (obligation.reviewStatus === "needs_review") return "border-l-ink-accent";
  return "border-l-border-strong";
}

/* ---------------------------------------------------------------- actions */

/**
 * The escapes: everything that is not "Confirm".
 *
 * They live inside the row's detail panel rather than beside the title,
 * because a register is read far more often than it is edited, and six
 * equally-weighted buttons on every one of thirteen rows is what made this
 * screen unreadable.
 */
function ObligationEscapes({
  obligation,
  awardId,
}: {
  obligation: ObligationWithCitations;
  awardId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function setStatus(status: ReviewStatus, success: string) {
    const formData = new FormData();
    formData.set("obligationId", obligation.id);
    formData.set("reviewStatus", status);

    startTransition(async () => {
      const result = await setReviewStatusAction(formData);
      if (result.ok) toast.success(success);
      else toast.error(result.message ?? "That could not be saved.");
    });
  }

  function remove() {
    const formData = new FormData();
    formData.set("obligationId", obligation.id);

    startTransition(async () => {
      const result = await deleteObligationAction(formData);
      if (result.ok) toast.success("Removed from the register.");
      else toast.error(result.message ?? "That could not be removed.");
      setConfirmingDelete(false);
    });
  }

  return (
    <ButtonRow data-print="hide">
      {obligation.reviewStatus !== "not_applicable" ? (
        <Button
          type="button"
          size="sm"
          variant="muted"
          disabled={pending}
          className="min-h-11 sm:min-h-8"
          onClick={() => setStatus("not_applicable", "Marked not applicable.")}
        >
          <X className="size-4" aria-hidden="true" />
          Not applicable
          <span className="sr-only"> — {obligation.title}</span>
        </Button>
      ) : null}

      <Button asChild size="sm" variant="ghost" className="min-h-11 sm:min-h-8">
        <Link href={`/app/awards/${awardId}/review`}>
          <ClipboardCheck className="size-4" aria-hidden="true" />
          Open in review queue
          <span className="sr-only"> for {obligation.title}</span>
        </Link>
      </Button>

      {/* Only user-added items can be deleted — an extracted item is a record of
          what the document said, and is retired through review, not removal. */}
      {obligation.origin === "manual" ? (
        confirmingDelete ? (
          <span className="inline-flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              className="min-h-11 sm:min-h-8"
              onClick={remove}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Yes, remove it
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              className="min-h-11 sm:min-h-8"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="destructiveGhost"
            disabled={pending}
            className="min-h-11 sm:min-h-8"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
            <span className="sr-only"> {obligation.title}</span>
          </Button>
        )
      ) : null}
    </ButtonRow>
  );
}

/** Confirm — the one action that stays on the collapsed row. */
function ConfirmAction({ obligation }: { obligation: ObligationWithCitations }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      className="min-h-11 sm:min-h-8"
      onClick={() => {
        const formData = new FormData();
        formData.set("obligationId", obligation.id);
        formData.set("reviewStatus", "confirmed");
        startTransition(async () => {
          const result = await setReviewStatusAction(formData);
          if (result.ok) toast.success("Confirmed.");
          else toast.error(result.message ?? "That could not be saved.");
        });
      }}
    >
      <Check className="size-4" aria-hidden="true" />
      Confirm
      <span className="sr-only"> {obligation.title}</span>
    </Button>
  );
}

/* ------------------------------------------------------------- card rows */

/**
 * When this is due — the first column, and the thing the eye should land on.
 *
 * Mono and tabular so a column of dates lines up, with the countdown carrying
 * the only colour: red past due, amber inside thirty days, quiet after that.
 */
function WhenCell({ obligation }: { obligation: ObligationWithCitations }) {
  const days = daysUntil(obligation.dueDate);

  if (obligation.dueDate) {
    const overdue = days !== null && days < 0;
    const soon = days !== null && days >= 0 && days <= 30;
    return (
      <p className="tabular font-mono leading-snug">
        <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground">
          {formatIsoDate(obligation.dueDate, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {days !== null ? (
          <span
            className={cn(
              "ml-2 text-[11px] sm:ml-0 sm:mt-0.5 sm:block",
              overdue
                ? "font-semibold text-destructive"
                : soon
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            {overdue
              ? `${Math.abs(days)} days overdue`
              : days === 0
                ? "due today"
                : `in ${days} days`}
          </span>
        ) : null}
      </p>
    );
  }

  /* Deliberately not mono: the monospace voice belongs to real calendar dates,
     so a column of them stays the thing the eye finds first. */
  return (
    <p className="text-[13px] leading-snug text-muted-foreground">
      <span>{obligation.originalDateText ? "No fixed date" : "No date stated"}</span>
      {obligation.originalDateText ? (
        <span className="ml-2 text-[11px] sm:ml-0 sm:mt-0.5 sm:block">stated in words</span>
      ) : null}
    </p>
  );
}

/**
 * One register row.
 *
 * Collapsed it answers three questions and nothing else: when is it due, what
 * is it, and where did it come from. The passage itself, the plain-English
 * restatement and the ways of retiring an item are one click away, behind a
 * disclosure that names what it holds — the citation is never hidden behind a
 * label that implies the claim stands on its own.
 */
function ObligationRow({
  obligation,
  awardId,
}: {
  obligation: ObligationWithCitations;
  awardId: string;
}) {
  const [open, setOpen] = useState(false);

  const meta = CATEGORY_META[obligation.category];
  const manual = obligation.origin === "manual";
  const primaryCitation =
    obligation.citations.find((citation) => citation.documentSegmentId) ?? obligation.citations[0];
  const hasCitation = Boolean(primaryCitation && primaryCitation.documentSegmentId);
  /* Long form on a card ("Page 2"), short form in the table ("p.2"): the row
     has the width to say what the number means, and a locator nobody can read
     is not a citation. */
  const locator =
    hasCitation && primaryCitation
      ? formatLocator(primaryCitation.locatorType, primaryCitation.locatorValue)
      : null;
  const alsoCited = obligation.citations.filter((citation) => citation.documentSegmentId).slice(1);
  const conflicted = obligation.dateConflicts.length > 1;

  const titleId = `register-${obligation.id}-title`;
  const panelId = `register-${obligation.id}-detail`;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-surface transition-shadow",
        open ? "shadow-raised" : "shadow-resting",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-[3px]", spineTone(obligation))}
      />

      <div className="grid gap-x-4 gap-y-1.5 py-3 pl-4 pr-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-baseline sm:py-3.5 sm:pl-5 sm:pr-4">
        <WhenCell obligation={obligation} />

        <div className="min-w-0">
          <h3
            id={titleId}
            className="text-[15px] font-semibold leading-snug tracking-[-0.011em] text-foreground"
          >
            {obligation.title}
          </h3>

          <div className="meta-row type-caption mt-1 font-normal text-muted-foreground">
            <span className="text-foreground-soft">{meta.label}</span>

            {/* Badges are wrapped: `.meta-row` draws its separator with a
                `::before`, and a quiet Badge uses its own `::before` for the
                marker dot. The wrapper gives each one its own pseudo-element. */}
            {obligation.priority === "critical" || obligation.priority === "high" ? (
              <span>
                <Badge
                  variant={obligation.priority === "critical" ? "destructive" : "warning"}
                  emphasis={obligation.priority === "critical" ? "solid" : "quiet"}
                  size="xs"
                >
                  {PRIORITY_LABELS[obligation.priority]} priority
                </Badge>
              </span>
            ) : null}

            {conflicted ? (
              <span>
                <Badge variant="warning" emphasis="solid" size="xs">
                  <TriangleAlert className="size-3" aria-hidden="true" />
                  Conflicting dates
                </Badge>
              </span>
            ) : null}

            <span>
              <ReviewStatusBadge status={obligation.reviewStatus} />
            </span>

            {manual ? (
              <span>Added by you</span>
            ) : locator ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  obligation.sourceStatus === "unverified"
                    ? "text-destructive"
                    : "text-foreground-soft",
                )}
              >
                <span className="font-mono text-[11.5px] tracking-[-0.01em]">{locator}</span>
                {obligation.sourceStatus !== "verified" ? (
                  <span className="font-medium">
                    {obligation.sourceStatus === "partial"
                      ? "partial match"
                      : "confirmation needed"}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <FileWarning className="size-3 shrink-0" aria-hidden="true" />
                {SOURCE_STATUS_LABELS.unverified}
              </span>
            )}

            {obligation.suggestedOwnerRole ? (
              <span>{obligation.suggestedOwnerRole}</span>
            ) : null}

            {obligation.recurrence ? <span>repeats {obligation.recurrence}</span> : null}
          </div>
        </div>

        <div
          className="mt-1 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:justify-end"
          data-print="hide"
        >
          {obligation.reviewStatus !== "confirmed" ? (
            <ConfirmAction obligation={obligation} />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={panelId}
            className="min-h-11 sm:min-h-8"
            onClick={() => setOpen((current) => !current)}
          >
            {hasCitation ? "Source" : "Detail"}
            <span className="sr-only"> for {obligation.title}</span>
            <ChevronDown
              className={cn("size-4 transition-transform duration-150", open && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {/*
        Always rendered so `aria-controls` always resolves; the `hidden`
        attribute does the hiding. Do not add a display utility to this
        element — it would defeat `[hidden]`.
      */}
      <div
        id={panelId}
        hidden={!open}
        className="border-t border-border-subtle px-4 pb-4 pt-3.5 sm:pl-5 sm:pr-4"
      >
        <div className="stack-md">
          <p className="type-small max-w-[74ch] text-foreground-soft">{obligation.description}</p>

          {obligation.originalDateText && !obligation.dueDate ? (
            <p className="type-caption font-normal text-muted-foreground">
              Timing, in the document&rsquo;s own words:{" "}
              <span className="text-foreground-soft">
                &ldquo;{obligation.originalDateText}&rdquo;
              </span>
            </p>
          ) : null}

          {conflicted ? (
            <div className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                The document gives more than one date for this requirement
              </p>
              <ul className="mt-1.5 space-y-1">
                {obligation.dateConflicts.map((conflict, index) => (
                  <li key={index} className="text-xs leading-relaxed text-warning">
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

          {/* The provenance panel: warm paper, serif at reading size, a mono
              locator. It should look like a piece of the document lifted into
              the row rather than more interface. */}
          <div className="overflow-hidden rounded-md border border-paper-border bg-paper">
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
                <blockquote className="evidence-quote evidence-quote-hang max-w-[66ch] px-4 pb-3">
                  &ldquo;{truncate(primaryCitation.excerpt, 340)}&rdquo;
                </blockquote>
              </figure>
            ) : manual ? (
              <p className="flex items-start gap-2 px-4 py-3 text-xs leading-relaxed text-ink-document-soft">
                <PenLine className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Entered by hand by someone at your organisation, so there is no passage from the
                  award document to quote.
                </span>
              </p>
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

            {!manual ? (
              <div className="meta-row type-caption border-t border-paper-border/70 px-4 py-2 font-normal text-ink-document-soft">
                <span
                  className={cn(
                    obligation.sourceStatus === "verified"
                      ? "text-success"
                      : obligation.sourceStatus === "partial"
                        ? "text-warning"
                        : "text-destructive",
                  )}
                >
                  {SOURCE_STATUS_LABELS[obligation.sourceStatus]}
                </span>
                <span>{INTERPRETATION_LABELS[obligation.interpretationLevel]}</span>
                <span>
                  <ConfidenceBadge confidence={obligation.confidence} />
                </span>
                {obligation.suggestedOwnerRole ? (
                  <span>Suggested owner: {obligation.suggestedOwnerRole}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {obligation.clarificationQuestion ? (
            <p className="rounded-md border border-border-subtle bg-muted px-3 py-2.5 text-xs leading-relaxed text-foreground-soft">
              <span className="font-semibold">Question for the funder: </span>
              {obligation.clarificationQuestion}
            </p>
          ) : null}

          {obligation.notes ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold">Your note: </span>
              {obligation.notes}
            </p>
          ) : null}

          <ObligationEscapes obligation={obligation} awardId={awardId} />
        </div>
      </div>
    </article>
  );
}

/* --------------------------------------------------------------- register */

export function Register({
  award,
  obligations,
}: {
  award: Award;
  obligations: ObligationWithCitations[];
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [view, setView] = useState<ViewMode>("cards");

  const indexed = useMemo(
    () => obligations.map((obligation) => ({ obligation, haystack: searchIndex(obligation) })),
    [obligations],
  );

  /* Filter options are built from what is actually here, so the controls never
     offer a value that returns nothing. */
  const present = useMemo(() => {
    const categories = new Set<ObligationCategory>();
    const statuses = new Set<ReviewStatus>();
    const priorities = new Set<ObligationPriority>();
    const owners = new Set<string>();
    let missingOwner = false;

    for (const obligation of obligations) {
      categories.add(obligation.category);
      statuses.add(obligation.reviewStatus);
      priorities.add(obligation.priority);
      if (obligation.suggestedOwnerRole) owners.add(obligation.suggestedOwnerRole);
      else missingOwner = true;
    }

    return {
      categoryGroups: GROUP_ORDER.map((group) => ({
        group,
        categories: OBLIGATION_CATEGORIES.filter(
          (category) => CATEGORY_META[category].group === group && categories.has(category),
        ),
      })).filter((entry) => entry.categories.length > 0),
      statuses: REVIEW_STATUSES.filter((status) => statuses.has(status)),
      priorities: OBLIGATION_PRIORITIES.filter((priority) => priorities.has(priority)),
      owners: [...owners].sort((a, b) => a.localeCompare(b)),
      missingOwner,
    };
  }, [obligations]);

  const visible = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    const filtered = indexed
      .filter(({ obligation, haystack }) => {
        if (query && !haystack.includes(query)) return false;
        if (filters.category !== "all" && obligation.category !== filters.category) return false;
        if (filters.status !== "all" && obligation.reviewStatus !== filters.status) return false;
        if (filters.priority !== "all" && obligation.priority !== filters.priority) return false;
        if (!matchesDateFilter(obligation, filters.date)) return false;
        if (filters.owner !== "all") {
          const owner = obligation.suggestedOwnerRole;
          if (filters.owner === NO_OWNER ? owner !== null : owner !== filters.owner) return false;
        }
        return true;
      })
      .map(({ obligation }) => obligation);

    return filtered.sort((a, b) => compareObligations(a, b, sortKey, sortDirection));
  }, [indexed, filters, sortKey, sortDirection]);

  /* Sorting by category is also a grouping: the register reads as sections
     rather than one undifferentiated list. */
  const groups = useMemo(() => {
    if (sortKey !== "category") {
      return [{ key: "all", label: null as string | null, items: visible }];
    }
    const ordered = sortDirection === "asc" ? GROUP_ORDER : [...GROUP_ORDER].reverse();
    return ordered
      .map((group) => ({
        key: group,
        label: CATEGORY_GROUP_LABELS[group] as string | null,
        items: visible.filter((obligation) => CATEGORY_META[obligation.category].group === group),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [visible, sortKey, sortDirection]);

  const filtersActive =
    filters.query.trim() !== "" ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.date !== "all" ||
    filters.owner !== "all";

  const conflictCount = obligations.filter(
    (obligation) => obligation.dateConflicts.length > 1,
  ).length;

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applySort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function ariaSort(key: SortKey): "none" | "ascending" | "descending" {
    if (key !== sortKey) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function sortHeader(key: SortKey, label: string, className?: string) {
    const active = key === sortKey;
    return (
      <th scope="col" aria-sort={ariaSort(key)} className={cn("px-3 py-2 text-left", className)}>
        <button
          type="button"
          onClick={() => applySort(key)}
          className="eyebrow inline-flex items-center gap-1 rounded-sm py-1 transition-colors hover:text-primary"
        >
          {label}
          {active ? (
            sortDirection === "asc" ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
          )}
          <span className="sr-only">
            {active
              ? `, sorted ${SORT_DIRECTION_LABELS[key][sortDirection]}. Activate to reverse.`
              : `, not sorted. Activate to sort by ${SORT_LABELS[key].toLowerCase()}.`}
          </span>
        </button>
      </th>
    );
  }

  /*
   * The controls are chrome, so they are set as chrome: an 11px label, a 36px
   * control, no panel around them and one hairline underneath. A filter bar
   * that is heavier than the data it filters teaches people to read the
   * controls instead of the register.
   */
  const labelClass = "eyebrow text-muted-foreground";
  const selectClass = "h-11 text-[13px] sm:h-9";

  return (
    <section aria-labelledby="register-heading" className="mt-6">
      <h2 id="register-heading" className="sr-only">
        Obligation register
      </h2>

      {conflictCount > 0 ? (
        <Alert
          role="note"
          variant="warning"
          className="mb-5"
          icon={<TriangleAlert aria-hidden="true" />}
        >
          <AlertDescription className="text-sm leading-relaxed">
            <span className="font-semibold">
              The document states conflicting dates for{" "}
              {conflictCount === 1 ? "one requirement" : `${conflictCount} requirements`}.
            </span>{" "}
            AwardLens has deliberately not picked one. Each affected item lists every date the
            document gives, with the passage it came from, so you can decide which governs — or ask
            the funder.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ------------------------------------------------------- controls --
          Hidden entirely when there is nothing to filter: an empty register
          should read as empty, not as a set of controls that do nothing. */}
      <div className={cn("border-b border-border pb-3.5", obligations.length === 0 && "hidden")}>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <Field className="min-w-[15rem] flex-[2_1_15rem]">
            <Label htmlFor="register-search" className={labelClass}>
              Search
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="register-search"
                type="search"
                value={filters.query}
                onChange={(event) => update("query", event.currentTarget.value)}
                placeholder="Title, description or quoted source text…"
                autoComplete="off"
                className={cn(selectClass, "pl-9")}
              />
            </div>
          </Field>

          <Field className="min-w-[10rem] flex-[1_1_10rem]">
            <Label htmlFor="register-category" className={labelClass}>
              Category
            </Label>
            <NativeSelect
              id="register-category"
              value={filters.category}
              onChange={(event) => update("category", event.currentTarget.value)}
              className={selectClass}
            >
              <option value="all">All categories</option>
              {present.categoryGroups.map(({ group, categories }) => (
                <optgroup key={group} label={CATEGORY_GROUP_LABELS[group]}>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_META[category].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-[11.5rem] flex-[1_1_11.5rem]">
            <Label htmlFor="register-status" className={labelClass}>
              Review status
            </Label>
            <NativeSelect
              id="register-status"
              value={filters.status}
              onChange={(event) => update("status", event.currentTarget.value)}
              className={selectClass}
            >
              <option value="all">All review statuses</option>
              {present.statuses.map((status) => (
                <option key={status} value={status}>
                  {REVIEW_STATUS_LABELS[status]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-[8rem] flex-[1_1_8rem]">
            <Label htmlFor="register-priority" className={labelClass}>
              Priority
            </Label>
            <NativeSelect
              id="register-priority"
              value={filters.priority}
              onChange={(event) => update("priority", event.currentTarget.value)}
              className={selectClass}
            >
              <option value="all">All priorities</option>
              {present.priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-[9rem] flex-[1_1_9rem]">
            <Label htmlFor="register-date" className={labelClass}>
              Due date
            </Label>
            <NativeSelect
              id="register-date"
              value={filters.date}
              onChange={(event) => update("date", event.currentTarget.value as DateFilter)}
              className={selectClass}
            >
              {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map((value) => (
                <option key={value} value={value}>
                  {DATE_FILTER_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-[10rem] flex-[1_1_10rem]">
            <Label htmlFor="register-owner" className={labelClass}>
              Suggested owner
            </Label>
            <NativeSelect
              id="register-owner"
              value={filters.owner}
              onChange={(event) => update("owner", event.currentTarget.value)}
              className={selectClass}
              disabled={present.owners.length === 0 && !present.missingOwner}
            >
              <option value="all">All owners</option>
              {present.owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
              {present.missingOwner ? <option value={NO_OWNER}>No owner suggested</option> : null}
            </NativeSelect>
          </Field>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p aria-live="polite" className="type-small text-muted-foreground">
            <span className="font-medium text-foreground">
              {visible.length} of {obligations.length}
            </span>{" "}
            {obligations.length === 1 ? "obligation" : "obligations"}
            {filtersActive ? " match your filters" : ""}
          </p>

          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-8"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset filters
            </Button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="register-sort" className={cn(labelClass, "shrink-0")}>
                Sort by
              </Label>
              <NativeSelect
                id="register-sort"
                value={sortKey}
                onChange={(event) => {
                  setSortKey(event.currentTarget.value as SortKey);
                  setSortDirection("asc");
                }}
                className="h-11 w-auto min-w-[8.5rem] text-[13px] sm:h-9"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-11 shrink-0 sm:size-9"
                aria-label={`Sort order: ${SORT_DIRECTION_LABELS[sortKey][sortDirection]}. Activate to reverse.`}
                onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
              >
                {sortDirection === "asc" ? (
                  <ArrowUp className="size-4" aria-hidden="true" />
                ) : (
                  <ArrowDown className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>

            <div
              role="group"
              aria-label="View mode"
              className="inline-flex overflow-hidden rounded-md border border-border-control"
            >
              <ViewToggle
                active={view === "cards"}
                label="Cards"
                icon={<LayoutList className="size-4" aria-hidden="true" />}
                onClick={() => setView("cards")}
              />
              <ViewToggle
                active={view === "table"}
                label="Table"
                icon={<Table2 className="size-4" aria-hidden="true" />}
                onClick={() => setView("table")}
              />
            </div>
            <AddObligationDialog awardId={award.id} />
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- results -- */}
      {obligations.length === 0 ? (
        <EmptyRegister awardId={award.id} />
      ) : visible.length === 0 ? (
        <NoMatches onReset={() => setFilters(DEFAULT_FILTERS)} />
      ) : view === "cards" ? (
        <div className="mt-5 space-y-7">
          {groups.map((group) => (
            <div key={group.key}>
              {group.label ? (
                <h3 className="eyebrow mb-2.5 text-muted-foreground">
                  {group.label}{" "}
                  <span className="text-border-control">({group.items.length})</span>
                </h3>
              ) : null}
              <ul className="space-y-2">
                {group.items.map((obligation) => (
                  <li key={obligation.id} id={`obligation-${obligation.id}`} className="scroll-mt-20">
                    <ObligationRow obligation={obligation} awardId={award.id} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-surface shadow-resting">
          <table className="w-full min-w-[58rem] border-collapse text-[13px]">
            <caption className="sr-only">
              Obligations for {award.name}. {visible.length} of {obligations.length} shown, sorted
              by {SORT_LABELS[sortKey].toLowerCase()}, {SORT_DIRECTION_LABELS[sortKey][sortDirection]}
              . Items that have not been confirmed by a person, and items whose source could not be
              verified, are labelled in the status and source columns.
            </caption>
            <thead className="border-b border-border bg-surface-sunken text-muted-foreground">
              <tr>
                <th scope="col" className="eyebrow px-3 py-2.5 text-left">
                  Title
                </th>
                {sortHeader("category", "Category", "w-44")}
                {sortHeader("due", "Due", "w-48")}
                {sortHeader("priority", "Priority", "w-28")}
                {sortHeader("status", "Status", "w-40")}
                <th scope="col" className="eyebrow w-44 px-3 py-2.5 text-left">
                  Source
                </th>
              </tr>
            </thead>

            {groups.map((group) => (
              <tbody key={group.key} className="divide-y divide-border-subtle">
                {group.label ? (
                  <tr className="bg-surface-sunken/60">
                    <th scope="rowgroup" colSpan={6} className="eyebrow px-3 py-2 text-left text-muted-foreground">
                      {group.label} ({group.items.length})
                    </th>
                  </tr>
                ) : null}
                {group.items.map((obligation) => (
                  <TableRow key={obligation.id} obligation={obligation} awardId={award.id} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ table parts */

function TableRow({
  obligation,
  awardId,
}: {
  obligation: ObligationWithCitations;
  awardId: string;
}) {
  const days = daysUntil(obligation.dueDate);
  const locator = citedLocator(obligation);
  const manual = obligation.origin === "manual";

  return (
    <tr className="align-top transition-colors hover:bg-muted">
      <td className={cn("border-l-[3px] px-3 py-2.5", spineBorder(obligation))}>
        <Link
          href={`/app/awards/${awardId}/review`}
          className="font-medium leading-snug text-foreground hover:text-primary hover:underline"
        >
          {obligation.title}
        </Link>
        {obligation.dateConflicts.length > 1 ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-warning">
            <TriangleAlert className="size-3" aria-hidden="true" />
            Conflicting dates in the document
          </span>
        ) : null}
      </td>

      <td className="px-3 py-2.5 text-foreground-soft">{CATEGORY_META[obligation.category].label}</td>

      <td className="px-3 py-2.5">
        {obligation.dueDate ? (
          <>
            <span className="tabular font-mono text-xs text-foreground">
              {formatIsoDate(obligation.dueDate, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
            {days !== null ? (
              <span
                className={cn(
                  "ml-1.5 tabular font-mono text-xs",
                  days < 0
                    ? "font-semibold text-destructive"
                    : days <= 30
                      ? "text-warning"
                      : "text-muted-foreground",
                )}
              >
                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `in ${days}d`}
              </span>
            ) : null}
          </>
        ) : obligation.originalDateText ? (
          <span className="text-xs text-muted-foreground">
            &ldquo;{truncate(obligation.originalDateText, 40)}&rdquo;
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No date stated</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        {obligation.priority === "critical" || obligation.priority === "high" ? (
          <Badge
            variant={obligation.priority === "critical" ? "destructive" : "warning"}
            emphasis={obligation.priority === "critical" ? "solid" : "quiet"}
            size="xs"
          >
            {PRIORITY_LABELS[obligation.priority]}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {PRIORITY_LABELS[obligation.priority]}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <ReviewStatusBadge status={obligation.reviewStatus} />
      </td>

      <td className="px-3 py-2.5">
        {manual ? (
          <span className="text-xs text-muted-foreground">Added by you</span>
        ) : locator ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-foreground-soft">{locator}</span>
            {obligation.sourceStatus === "unverified" ? (
              <Badge variant="destructive" size="xs">
                needs checking
              </Badge>
            ) : obligation.sourceStatus === "partial" ? (
              <Badge variant="warning" size="xs">
                partial match
              </Badge>
            ) : null}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <TriangleAlert className="size-3" aria-hidden="true" />
            needs checking
          </span>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------ small parts */

function ViewToggle({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] font-medium transition-colors sm:min-h-9",
        active
          ? "bg-primary-subtle text-primary-subtle-foreground"
          : "bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {active ? <span className="sr-only"> (current view)</span> : null}
    </button>
  );
}

function EmptyRegister({ awardId }: { awardId: string }) {
  return (
    <EmptyState
      className="mt-5"
      headingLevel={3}
      icon={<ClipboardCheck aria-hidden="true" />}
      title="This award has no obligations yet"
      description="Nothing has been extracted from the document, and nothing has been added by hand. If you expected requirements here, the document may not have been analysed successfully — check the award workspace, or add what you know yourself."
      actions={
        <>
          <AddObligationDialog awardId={awardId} />
          <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/app/awards/${awardId}`}>Back to the award</Link>
          </Button>
        </>
      }
    />
  );
}

function NoMatches({ onReset }: { onReset: () => void }) {
  return (
    <EmptyState
      className="mt-5"
      headingLevel={3}
      icon={<Search aria-hidden="true" />}
      title="No obligations match your filters"
      description="This award does have obligations — none of them match the search and filters you have set right now."
      actions={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 sm:min-h-8"
          onClick={onReset}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Reset filters
        </Button>
      }
    />
  );
}
