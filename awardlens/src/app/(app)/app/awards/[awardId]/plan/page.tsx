import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getAwardWorkspace } from "@/lib/awards/queries";
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_META,
  INTERPRETATION_LABELS,
  PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
  type CategoryGroup,
  type ObligationWithCitations,
} from "@/lib/domain/types";
import { formatLocator } from "@/lib/documents/segment";
import { cn, formatCurrency, formatIsoDate } from "@/lib/utils";
import { PrintButton } from "@/components/award/print-button";

export const metadata: Metadata = { title: "Operating plan" };

const GROUP_ORDER: CategoryGroup[] = ["deadlines", "money", "programmatic", "compliance"];

/**
 * The printable operating plan.
 *
 * We produce this with a print stylesheet rather than a server-side PDF binary:
 * it removes a heavy native dependency from the deployment, always reflects the
 * live data, and lets the user save as PDF from any browser.
 *
 * It is set as a document rather than as a screen. Every requirement is a row
 * in a two-column grid — when it happens on the left, what it is on the right —
 * so a reader can run a finger down the timing column, and so a long piece of
 * relative timing ("within sixty (60) days after the close of the Grant
 * Period…") has somewhere to wrap instead of running off the edge of the page.
 */
export default async function PlanPage(props: {
  params: Promise<{ awardId: string }>;
}) {
  const { awardId } = await props.params;
  const session = await requireSession();

  const workspace = await getAwardWorkspace(awardId, session.organization.id);
  if (!workspace) notFound();

  const { award, obligations, progress } = workspace;

  const included = obligations.filter(
    (obligation) =>
      obligation.reviewStatus !== "archived" && obligation.reviewStatus !== "not_applicable",
  );

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: included
      .filter((obligation) => CATEGORY_META[obligation.category].group === group)
      .sort(byDueDateThenPriority),
  })).filter((entry) => entry.items.length > 0);

  const questions = included.filter((obligation) => obligation.clarificationQuestion);

  return (
    <div className="container-page pt-6">
      {/*
       * Print rules for this page only, alongside the shared ones at the bottom
       * of globals.css. They live here because the operating plan is the one
       * surface whose printed form is the product: a wider page box, a document
       * measure that does not apply on paper, and headings that never end a
       * page on their own.
       */}
      <style href="al-plan-print" precedence="high">{`
        @media print {
          @page { margin: 18mm 16mm; }
          [data-plan] { max-width: none; }
          [data-plan] h1 { font-size: 20pt; }
          [data-plan] h2 { font-size: 12.5pt; break-after: avoid; }
          [data-plan] h3 { font-size: 11pt; break-after: avoid; }
          [data-plan-item] { break-inside: avoid; }
          /* The timing gutter narrows on paper: print measures in points, and
             9rem of screen gutter is a third of a printed line. */
          [data-plan-item] { grid-template-columns: 30mm minmax(0, 1fr); column-gap: 5mm; }
          /* Match the caption to the quote rule, which globals.css re-pads
             for print. */
          [data-plan] figcaption { padding-left: 6pt; }
          [data-plan] p { orphans: 2; widows: 2; }
          [data-plan-note] { break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3" data-print="hide">
        <Link
          href={`/app/awards/${awardId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {award.name}
        </Link>
        <PrintButton />
      </div>

      <article data-plan className="mx-auto mt-8 max-w-[46rem] pb-4">
        {/* ------------------------------------------------------ title block */}
        <header>
          <p className="eyebrow text-primary">Award operating plan</p>
          <h1 className="type-title mt-2.5">{award.name}</h1>
          <p className="type-small mt-2 text-muted-foreground">
            {award.funder ?? "Funder not identified"}
            {award.awardNumber ? ` · Award ${award.awardNumber}` : ""}
            {award.recipientName ? ` · Recipient: ${award.recipientName}` : ""}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
            <PlanFact label="Amount" value={formatCurrency(award.awardAmount, award.currency)} />
            <PlanFact label="Starts" value={formatIsoDate(award.startDate)} />
            <PlanFact label="Ends" value={formatIsoDate(award.endDate)} />
            <PlanFact label="Obligations" value={String(included.length)} />
          </dl>

          <p
            data-plan-note
            className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground"
          >
            Prepared by AwardLens for {session.organization.name} on{" "}
            {formatIsoDate(new Date().toISOString().slice(0, 10))}. {progress.confirmed} of{" "}
            {progress.total} items have been confirmed by a person.{" "}
            {progress.needsReview > 0 ? (
              <strong className="font-semibold text-foreground">
                {progress.needsReview} items in this plan have not yet been reviewed.
              </strong>
            ) : null}{" "}
            AwardLens organises what the award document says; it does not provide legal, accounting,
            tax or compliance advice, and cannot guarantee every requirement was found. Verify
            against the award document before acting.
          </p>
        </header>

        {award.grantPeriodText ? (
          <section className="print-avoid-break mt-9">
            <PlanSectionHeading>Grant period, as worded</PlanSectionHeading>
            <p className="evidence-quote evidence-quote-hang mt-3 border-l-2 border-border-strong pl-4">
              &ldquo;{award.grantPeriodText}&rdquo;
            </p>
          </section>
        ) : null}

        {/* ---------------------------------------------------- requirements */}
        {grouped.map(({ group, items }) => (
          <section key={group} className="mt-10">
            <PlanSectionHeading count={items.length}>
              {CATEGORY_GROUP_LABELS[group]}
            </PlanSectionHeading>
            <ol className="mt-1">
              {items.map((obligation) => (
                <li key={obligation.id}>
                  <PlanItem obligation={obligation} />
                </li>
              ))}
            </ol>
          </section>
        ))}

        {questions.length > 0 ? (
          <section className="print-break-before mt-10">
            <PlanSectionHeading count={questions.length} noun="question">
              Questions to put to the funder
            </PlanSectionHeading>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-foreground-soft marker:font-mono marker:text-xs marker:text-muted-foreground">
              {questions.map((obligation) => (
                <li key={obligation.id} className="print-avoid-break pl-1">
                  <span className="font-semibold text-foreground">{obligation.title}: </span>
                  {obligation.clarificationQuestion}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {award.governingDocuments.length > 0 ? (
          <section className="print-avoid-break mt-10">
            <PlanSectionHeading>Documents incorporated by reference</PlanSectionHeading>
            <p className="mt-4 text-sm leading-relaxed text-foreground-soft">
              This award refers to {award.governingDocuments.join(", ")}. Those documents carry
              their own requirements and were not analysed. Review them separately.
            </p>
          </section>
        ) : null}
      </article>
    </div>
  );
}

function byDueDateThenPriority(a: ObligationWithCitations, b: ObligationWithCitations): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return order[a.priority] - order[b.priority];
}

/** One section head: a rule, a name, and how many entries sit under it. */
function PlanSectionHeading({
  children,
  count,
  noun = "requirement",
}: {
  children: React.ReactNode;
  count?: number;
  noun?: string;
}) {
  return (
    <h2 className="flex items-baseline justify-between gap-4 border-b border-foreground pb-1.5 text-[19px] font-semibold tracking-[-0.018em] text-foreground">
      {children}
      {count ? (
        <span className="type-caption tabular shrink-0 font-normal text-muted-foreground">
          {count} {count === 1 ? noun : `${noun}s`}
        </span>
      ) : null}
    </h2>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 font-mono text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * One requirement, set as a document row.
 *
 * The left column carries the timing and nothing else. Anything the document
 * expressed in words rather than a date is stated as a quotation under the
 * title, where it has a full measure to wrap into — a right-aligned monospace
 * string is how "within sixty (60) days after the close of the Grant Period
 * unless the Foundat" ended up printed on a page.
 */
function PlanItem({ obligation }: { obligation: ObligationWithCitations }) {
  const citation =
    obligation.citations.find((entry) => entry.documentSegmentId) ?? obligation.citations[0];
  const dated = Boolean(obligation.dueDate);
  const cited = Boolean(citation && citation.documentSegmentId);

  /*
   * How the item was arrived at, and whether a person has signed it off. It
   * belongs beside the passage, not in the run of classifiers at the foot of
   * the item — and moving it there keeps both lines to one line each.
   */
  const provenance = (
    <>
      <span>
        {obligation.origin === "manual"
          ? "Added by your team"
          : INTERPRETATION_LABELS[obligation.interpretationLevel]}
      </span>
      <span
        className={cn(
          obligation.reviewStatus === "confirmed"
            ? "text-success"
            : "font-medium text-foreground-soft",
        )}
      >
        {REVIEW_STATUS_LABELS[obligation.reviewStatus]}
      </span>
    </>
  );

  return (
    <div
      data-plan-item
      className="grid gap-x-6 gap-y-1 border-b border-border-subtle py-4 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]"
    >
      {/* -------------------------------------------------------- when */}
      <div className="tabular">
        {/* Mono is reserved for real calendar dates, so a reader can run a
            finger down the column and find the ones that are actually fixed. */}
        <p
          className={cn(
            "text-[13px] leading-snug",
            dated ? "font-mono font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {dated
            ? formatIsoDate(obligation.dueDate, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : obligation.originalDateText
              ? "No fixed date"
              : "No date stated"}
        </p>
        {obligation.recurrence ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            repeats {obligation.recurrence}
          </p>
        ) : null}
        {obligation.internalDueDate ? (
          /* Only the date is mono; "start by" is a sentence, and monospaced
             word-spacing makes a two-word prefix look mis-set. */
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            start by{" "}
            <span className="font-mono">
              {formatIsoDate(obligation.internalDueDate, { month: "short", day: "numeric" })}
            </span>
          </p>
        ) : null}
      </div>

      {/* -------------------------------------------------------- what */}
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.012em] text-foreground">
          {obligation.title}
        </h3>

        <p className="mt-1.5 text-sm leading-relaxed text-foreground-soft">
          {obligation.description}
        </p>

        {!dated && obligation.originalDateText ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Timing, in the document&rsquo;s own words:{" "}
            <span className="text-foreground-soft">
              &ldquo;{obligation.originalDateText}&rdquo;
            </span>
          </p>
        ) : null}

        {cited && citation ? (
          <figure className="mt-2.5">
            <blockquote className="evidence-quote evidence-quote-hang border-l-2 border-border-strong pl-4 text-[14px]">
              &ldquo;{citation.excerpt}&rdquo;
            </blockquote>
            <figcaption className="meta-row type-caption mt-1 pl-4 font-normal text-muted-foreground">
              <span>— {formatLocator(citation.locatorType, citation.locatorValue)}</span>
              {provenance}
            </figcaption>
          </figure>
        ) : obligation.origin === "manual" ? null : (
          <p className="mt-2.5 text-[12.5px] font-medium text-destructive">
            Source not confirmed — verify this against the award document.
          </p>
        )}

        {/* The classifiers last, and set as a caption: they qualify the
            requirement, they are not the requirement. */}
        <p className="meta-row type-caption mt-2.5 font-normal text-muted-foreground">
          <span>{CATEGORY_META[obligation.category].label}</span>
          <span>{PRIORITY_LABELS[obligation.priority]} priority</span>
          {obligation.suggestedOwnerRole ? (
            <span>Owner: {obligation.suggestedOwnerRole}</span>
          ) : null}
          {cited ? null : provenance}
        </p>
      </div>
    </div>
  );
}
