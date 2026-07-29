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
import { formatCurrency, formatIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

      <header className="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{award.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {award.funder ?? "Funder not identified"}
              {award.awardNumber ? (
                <>
                  {" · "}
                  <span className="font-mono">{award.awardNumber}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2" data-print="hide">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/awards/${award.id}/ask`}>
                <MessageSquareText className="size-4" aria-hidden="true" />
                Ask this award
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/awards/${award.id}/plan`}>
                <Printer className="size-4" aria-hidden="true" />
                Operating plan
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/app/awards/${award.id}/review`}>
                <ClipboardList className="size-4" aria-hidden="true" />
                {progress.needsReview > 0 ? `Review ${progress.needsReview} items` : "Review"}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCell label="Award amount" value={formatCurrency(award.awardAmount, award.currency)} mono />
        <SummaryCell
          label="Grant period"
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
        <div className="mt-4 rounded-lg border border-ink-accent-subtle bg-ink-accent-subtle p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-accent">
                {progress.needsReview} of {progress.total} items still need your review
              </p>
              <p className="mt-0.5 text-xs text-ink-accent">
                Nothing here is treated as confirmed until you check it against the document.
              </p>
            </div>
            <Progress value={progress.percentComplete} className="w-full max-w-48" />
          </div>
        </div>
      ) : null}

      {progress.unverifiedSource > 0 ? (
        <Alert variant="warning" className="mt-4">
          <AlertTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" aria-hidden="true" />
            {progress.unverifiedSource}{" "}
            {progress.unverifiedSource === 1 ? "item needs" : "items need"} source confirmation
          </AlertTitle>
          <AlertDescription>
            We could not match these to a passage in your document. Check them against the award
            before relying on them.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-8">
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

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Download className="size-4" aria-hidden="true" />
                Exports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ExportLink
                href={`/api/awards/${award.id}/export/csv`}
                label="Obligation register (CSV)"
                hint="Every item, including unreviewed ones."
              />
              <ExportLink
                href={`/api/awards/${award.id}/export/ics`}
                label="Deadline calendar (.ics)"
                hint="Confirmed dated items only."
              />
              <ExportLink
                href={`/api/awards/${award.id}/export/json`}
                label="Full data (JSON)"
                hint="Everything, with citations and review state."
              />
              <Link
                href={`/app/awards/${award.id}/plan`}
                className="block rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="font-medium">Printable operating plan</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Print or save as PDF from your browser.
                </span>
              </Link>
            </CardContent>
          </Card>

          {openQuestions.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Questions for the funder ({openQuestions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {openQuestions.slice(0, 6).map((obligation) => (
                    <li key={obligation.id} className="text-xs leading-relaxed text-foreground-soft">
                      {obligation.clarificationQuestion}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="size-4" aria-hidden="true" />
                Source document
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The source document has been deleted. Obligations remain, but source passages can
                  no longer be opened.
                </p>
              ) : (
                documents.map((document) => (
                  <div key={document.id}>
                    <p className="truncate text-sm font-medium">{document.originalFilename}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {(document.byteSize / 1024).toFixed(0)} KB
                      {document.pageCount ? ` · ${document.pageCount} pages` : ""}
                    </p>
                  </div>
                ))
              )}
              {award.governingDocuments.length > 0 ? (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium">Referenced documents</p>
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

function SummaryCell({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "success";
}) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold ${mono ? "font-mono" : ""} ${
          tone === "success" ? "text-success" : "text-foreground"
        }`}
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
  return (
    <section aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="flex items-center justify-between gap-3">
        <h2
          id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h2>
        {total && total > items.length ? (
          <Link
            href={`/app/awards/${awardId}/obligations`}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all {total}
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-5 text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((obligation) => (
            <EvidenceRail key={obligation.id} obligation={obligation} compact />
          ))}
        </div>
      )}
    </section>
  );
}

function ExportLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <a
      href={href}
      download
      className="block rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
    >
      <span className="font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </a>
  );
}
