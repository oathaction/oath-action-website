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
import { formatCurrency, formatIsoDate } from "@/lib/utils";
import { PrintButton } from "@/components/award/print-button";

export const metadata: Metadata = { title: "Operating plan" };

const GROUP_ORDER: CategoryGroup[] = ["deadlines", "money", "programmatic", "compliance"];

/**
 * The printable operating plan.
 *
 * We produce this with a print stylesheet rather than a server-side PDF binary:
 * it removes a heavy native dependency from the deployment, always reflects the
 * live data, and lets the user save as PDF from any browser.
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

      <article className="mx-auto mt-6 max-w-4xl">
        <header className="border-b border-border pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Award operating plan
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{award.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {award.funder ?? "Funder not identified"}
            {award.awardNumber ? ` · Award ${award.awardNumber}` : ""}
            {award.recipientName ? ` · Recipient: ${award.recipientName}` : ""}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <PlanFact label="Amount" value={formatCurrency(award.awardAmount, award.currency)} />
            <PlanFact label="Starts" value={formatIsoDate(award.startDate)} />
            <PlanFact label="Ends" value={formatIsoDate(award.endDate)} />
            <PlanFact label="Obligations" value={String(included.length)} />
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Prepared by AwardLens for {session.organization.name} on{" "}
            {formatIsoDate(new Date().toISOString().slice(0, 10))}. {progress.confirmed} of{" "}
            {progress.total} items have been confirmed by a person.{" "}
            {progress.needsReview > 0 ? (
              <strong className="text-foreground">
                {progress.needsReview} items in this plan have not yet been reviewed.
              </strong>
            ) : null}{" "}
            AwardLens organises what the award document says; it does not provide legal, accounting,
            tax or compliance advice, and cannot guarantee every requirement was found. Verify
            against the award document before acting.
          </p>
        </header>

        {award.grantPeriodText ? (
          <section className="mt-6 print-avoid-break">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Grant period, as worded
            </h2>
            <p className="evidence-quote mt-1.5 border-l-2 border-border-strong pl-3">
              &ldquo;{award.grantPeriodText}&rdquo;
            </p>
          </section>
        ) : null}

        {grouped.map(({ group, items }) => (
          <section key={group} className="mt-8 print-avoid-break">
            <h2 className="border-b border-border pb-1.5 text-base font-semibold tracking-tight">
              {CATEGORY_GROUP_LABELS[group]}
            </h2>
            <ol className="mt-3 space-y-4">
              {items.map((obligation) => (
                <li key={obligation.id} className="print-avoid-break">
                  <PlanItem obligation={obligation} />
                </li>
              ))}
            </ol>
          </section>
        ))}

        {questions.length > 0 ? (
          <section className="mt-8 print-break-before">
            <h2 className="border-b border-border pb-1.5 text-base font-semibold tracking-tight">
              Questions to put to the funder
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground-soft">
              {questions.map((obligation) => (
                <li key={obligation.id}>
                  <span className="font-medium text-foreground">{obligation.title}: </span>
                  {obligation.clarificationQuestion}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {award.governingDocuments.length > 0 ? (
          <section className="mt-8 print-avoid-break">
            <h2 className="border-b border-border pb-1.5 text-base font-semibold tracking-tight">
              Documents incorporated by reference
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground-soft">
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

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-medium">{value}</dd>
    </div>
  );
}

function PlanItem({ obligation }: { obligation: ObligationWithCitations }) {
  const citation =
    obligation.citations.find((entry) => entry.documentSegmentId) ?? obligation.citations[0];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-semibold">{obligation.title}</h3>
        <p className="font-mono text-xs text-muted-foreground">
          {obligation.dueDate
            ? formatIsoDate(obligation.dueDate)
            : (obligation.originalDateText ?? "No date stated")}
          {obligation.recurrence ? ` · ${obligation.recurrence}` : ""}
        </p>
      </div>

      <p className="mt-1 text-sm leading-relaxed text-foreground-soft">{obligation.description}</p>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {CATEGORY_META[obligation.category].label} · {PRIORITY_LABELS[obligation.priority]} priority
        {obligation.suggestedOwnerRole ? ` · Owner: ${obligation.suggestedOwnerRole}` : ""}
        {obligation.internalDueDate ? ` · Start by ${formatIsoDate(obligation.internalDueDate)}` : ""}
        {" · "}
        {REVIEW_STATUS_LABELS[obligation.reviewStatus]}
        {obligation.origin === "manual"
          ? " · Added by your team"
          : ` · ${INTERPRETATION_LABELS[obligation.interpretationLevel]}`}
      </p>

      {citation && citation.documentSegmentId ? (
        <figure className="mt-1.5">
          <blockquote className="evidence-quote border-l-2 border-border-strong pl-3 text-[13px]">
            &ldquo;{citation.excerpt}&rdquo;
          </blockquote>
          <figcaption className="mt-0.5 pl-3 text-xs text-muted-foreground">
            — {formatLocator(citation.locatorType, citation.locatorValue)}
          </figcaption>
        </figure>
      ) : obligation.origin === "manual" ? null : (
        <p className="mt-1.5 text-xs font-medium text-destructive">
          Source not confirmed — verify this against the award document.
        </p>
      )}
    </div>
  );
}
