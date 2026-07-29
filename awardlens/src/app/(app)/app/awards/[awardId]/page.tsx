import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  MessageSquareText,
  Printer,
  ShieldAlert,
} from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getAwardWorkspace } from "@/lib/awards/queries";
import type { ObligationWithCitations } from "@/lib/domain/types";
import { cn, formatCurrency, formatIsoDate } from "@/lib/utils";
import { Button, ButtonRow } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/misc";
import { EvidenceRail } from "@/components/evidence/evidence-rail";
import { AwardDangerZone } from "@/components/award/award-danger-zone";

export async function generateMetadata(props: {
  params: Promise<{ awardId: string }>;
}): Promise<Metadata> {
  const { awardId } = await props.params;
  const session = await requireSession();
  const workspace = await getAwardWorkspace(awardId, session.organization.id);
  return { title: workspace?.award.name ?? "Award" };
}

export default async function AwardPage(props: {
  params: Promise<{ awardId: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { awardId } = await props.params;
  const { duplicate } = await props.searchParams;
  const session = await requireSession();

  const workspace = await getAwardWorkspace(awardId, session.organization.id);
  if (!workspace) notFound();

  const { award, obligations, documents, progress, latestRun } = workspace;

  const upcoming = obligations
    .filter(
      (obligation) =>
        obligation.dueDate &&
        obligation.reviewStatus !== "not_applicable" &&
        obligation.reviewStatus !== "archived",
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 6);

  const restrictions = obligations.filter(
    (obligation) =>
      obligation.category === "restricted_use" ||
      obligation.category === "allowable_cost" ||
      obligation.category === "prior_approval",
  );
  const deliverables = obligations.filter(
    (obligation) =>
      obligation.category === "deliverable" || obligation.category === "performance_metric",
  );
  const openQuestions = obligations.filter(
    (obligation) => obligation.clarificationQuestion && obligation.reviewStatus !== "confirmed",
  );

  return (
    <div className="container-page pt-6">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        data-print="hide"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Dashboard
      </Link>

      {duplicate ? (
        <Alert variant="info" className="mt-4">
          <AlertDescription>
            You&rsquo;d already uploaded this exact document, so we opened the existing award
            instead of analysing it again.
          </AlertDescription>
        </Alert>
      ) : null}

      {award.status === "failed" ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Analysis did not finish</AlertTitle>
          <AlertDescription>
            <p>
              {latestRun?.errorMessage
                ? "The document was stored, but the analysis failed."
                : "The document was stored, but no obligations were extracted."}{" "}
              You can try again without re-uploading.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <header className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="type-title">{award.name}</h1>
          <p className="type-small mt-1.5 text-muted-foreground">
            {award.funder ?? "Funder not identified"}
            {award.awardNumber ? (
              <>
                {" · "}
                <span className="font-mono">{award.awardNumber}</span>
              </>
            ) : null}
          </p>
        </div>

        <ButtonRow data-print="hide">
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/app/awards/${award.id}/ask`}>
              <MessageSquareText className="size-4" aria-hidden="true" />
              Ask this award
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/app/awards/${award.id}/plan`}>
              <Printer className="size-4" aria-hidden="true" />
              Operating plan
            </Link>
          </Button>
          <Button asChild size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/app/awards/${award.id}/review`}>
              <ClipboardList className="size-4" aria-hidden="true" />
              {progress.needsReview > 0 ? `Review ${progress.needsReview} items` : "Review"}
            </Link>
          </Button>
        </ButtonRow>
      </header>

      {/* The four facts a grants manager reads first. Unequal columns because
          a date range needs room and a percentage does not. */}
      <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border shadow-resting sm:grid-cols-2 lg:grid-cols-[1fr_1.55fr_0.8fr_0.85fr]">
        <SummaryCell
          label="Award amount"
          value={formatCurrency(award.awardAmount, award.currency)}
          mono
        />
        <SummaryCell
          label="Grant period"
          size="sm"
          value={
            award.startDate || award.endDate
              ? `${formatIsoDate(award.startDate, { month: "short", day: "numeric", year: "numeric" })} – ${formatIsoDate(award.endDate, { month: "short", day: "numeric", year: "numeric" })}`
              : (award.grantPeriodText ?? "Not stated")
          }
        />
        <SummaryCell label="Obligations" value={String(progress.total)} mono />
        <SummaryCell
          label="Reviewed"
          value={`${progress.percentComplete}%`}
          mono
          tone={progress.percentComplete === 100 ? "success" : undefined}
        />
      </dl>

      {progress.needsReview > 0 ? (
        /* --ink-accent on --ink-accent-subtle is 10.85:1. The bar sits under
           the sentence at full width, so at 0% it reads as a track waiting to
           be filled rather than as an empty box floating beside the text. */
        <section
          aria-labelledby="review-progress-heading"
          className="mt-4 rounded-lg border border-ink-accent-border bg-ink-accent-subtle px-5 py-4"
        >
          <h2 id="review-progress-heading" className="type-subhead text-ink-accent">
            {progress.needsReview} of {progress.total} items still need your review
          </h2>
          <p className="type-small mt-1 text-ink-accent">
            Nothing here is treated as confirmed until you check it against the document.
          </p>
          <div className="mt-3.5 flex max-w-sm items-center gap-3">
            <Progress
              value={progress.percentComplete}
              aria-label={`Review ${progress.percentComplete} percent complete`}
              className="flex-1"
            />
            <p className="tabular shrink-0 font-mono text-[11px] font-medium text-ink-accent">
              {progress.confirmed} / {progress.total} confirmed
            </p>
          </div>
        </section>
      ) : null}

      {progress.unverifiedSource > 0 ? (
        <Alert
          variant="warning"
          role="note"
          className="mt-4"
          icon={<ShieldAlert aria-hidden="true" />}
        >
          <AlertTitle>
            {progress.unverifiedSource}{" "}
            {progress.unverifiedSource === 1 ? "item needs" : "items need"} source confirmation
          </AlertTitle>
          <AlertDescription>
            We could not match these to a passage in your document. Check them against the award
            before relying on them.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-9 grid gap-x-10 gap-y-9 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-9">
          <Section
            title="Upcoming deadlines"
            icon={<CalendarDays className="size-4" aria-hidden="true" />}
            empty="No dated deadlines were found. Requirements with relative timing are in the register."
            items={upcoming}
            awardId={award.id}
          />

          <Section
            title="Restrictions and approvals"
            icon={<ShieldAlert className="size-4" aria-hidden="true" />}
            empty="No restrictions on the use of funds were found in this document."
            items={restrictions.slice(0, 5)}
            awardId={award.id}
            total={restrictions.length}
          />

          <Section
            title="Deliverables and measures"
            icon={<ClipboardList className="size-4" aria-hidden="true" />}
            empty="No specific deliverables or performance measures were found."
            items={deliverables.slice(0, 5)}
            awardId={award.id}
            total={deliverables.length}
          />
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader padding="tight" className="pb-2.5">
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <Download className="size-4 text-muted-foreground" aria-hidden="true" />
                Exports
              </CardTitle>
            </CardHeader>
            <CardContent padding="tight" className="px-0 pb-0">
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                <ExportLink
                  href={`/api/awards/${award.id}/export/csv`}
                  label="Obligation register (CSV)"
                  hint="Every item, including unreviewed ones."
                  download
                />
                <ExportLink
                  href={`/api/awards/${award.id}/export/ics`}
                  label="Deadline calendar (.ics)"
                  hint="Confirmed dated items only."
                  download
                />
                <ExportLink
                  href={`/api/awards/${award.id}/export/json`}
                  label="Full data (JSON)"
                  hint="Everything, with citations and review state."
                  download
                />
                <ExportLink
                  href={`/app/awards/${award.id}/plan`}
                  label="Printable operating plan"
                  hint="Print or save as PDF from your browser."
                />
              </ul>
            </CardContent>
          </Card>

          {openQuestions.length > 0 ? (
            <Card tone="sunken" elevation="flat">
              <CardHeader padding="tight" className="pb-2">
                <CardTitle className="text-[15px]">
                  Questions for the funder{" "}
                  <span className="tabular font-mono text-xs font-normal text-muted-foreground">
                    ({openQuestions.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent padding="tight">
                <ul className="space-y-2.5">
                  {openQuestions.slice(0, 6).map((obligation) => (
                    <li
                      key={obligation.id}
                      className="border-l-2 border-border-strong pl-3 text-xs leading-relaxed text-foreground-soft"
                    >
                      {obligation.clarificationQuestion}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader padding="tight" className="pb-2.5">
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                Source document
              </CardTitle>
            </CardHeader>
            <CardContent padding="tight" className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The source document has been deleted. Obligations remain, but source passages can
                  no longer be opened.
                </p>
              ) : (
                documents.map((document) => (
                  <div key={document.id}>
                    <p className="truncate text-sm font-medium">{document.originalFilename}</p>
                    <p className="tabular mt-0.5 font-mono text-xs text-muted-foreground">
                      {(document.byteSize / 1024).toFixed(0)} KB
                      {document.pageCount ? ` · ${document.pageCount} pages` : ""}
                    </p>
                  </div>
                ))
              )}
              {award.governingDocuments.length > 0 ? (
                <div className="rule pt-3">
                  <p className="type-caption text-foreground-soft">Referenced documents</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    This award incorporates {award.governingDocuments.join(", ")}. Those documents
                    carry their own requirements and are not analysed here.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <AwardDangerZone
            awardId={award.id}
            documentId={documents[0]?.id ?? null}
            canReprocess={documents.length > 0}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One cell of the summary strip. `size="sm"` is for the values that are a
 * phrase rather than a figure — a date range set at metric size out-shouts the
 * award amount, which is the number people actually came to read.
 */
function SummaryCell({
  label,
  value,
  mono,
  tone,
  size = "md",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "success";
  size?: "sm" | "md";
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "metric mt-2",
          size === "sm" ? "text-[17px]" : "text-2xl",
          mono && "font-mono",
          tone === "success" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Section({
  title,
  icon,
  items,
  empty,
  awardId,
  total,
}: {
  title: string;
  icon: React.ReactNode;
  items: ObligationWithCitations[];
  empty: string;
  awardId: string;
  total?: number;
}) {
  const id = `section-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id={id} className="type-heading flex items-center gap-2.5 text-foreground">
          <span className="text-muted-foreground [&>svg]:size-[19px]">{icon}</span>
          {title}
        </h2>
        {total && total > items.length ? (
          <Link
            href={`/app/awards/${awardId}/obligations`}
            className="type-caption shrink-0 text-primary hover:underline"
          >
            View all {total}
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface/60 px-5 py-8">
          <p className="mx-auto max-w-sm text-center text-sm leading-relaxed text-foreground-soft">
            {empty}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
            Nothing found is not the same as nothing there.{" "}
            <Link
              href={`/app/awards/${awardId}/obligations`}
              className="font-medium text-primary hover:underline"
            >
              Search the full register
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((obligation) => (
            <EvidenceRail key={obligation.id} obligation={obligation} compact />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A row in the exports list. `download` targets are plain anchors — they are
 * file responses from a route handler, not client navigations — while the
 * operating plan is a real page and stays a `<Link>`.
 */
function ExportLink({
  href,
  label,
  hint,
  download,
}: {
  href: string;
  label: string;
  hint: string;
  download?: boolean;
}) {
  const className = "block px-4 py-2.5 transition-colors hover:bg-muted";
  const body = (
    <>
      <span className="block text-[13px] font-medium text-foreground">{label}</span>
      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span>
    </>
  );

  return (
    <li>
      {download ? (
        <a href={href} download className={className}>
          {body}
        </a>
      ) : (
        <Link href={href} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}
