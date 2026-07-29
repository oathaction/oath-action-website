import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getAwardWorkspace } from "@/lib/awards/queries";
import { Register } from "@/components/obligations/register";
import { Button } from "@/components/ui/button";

interface ObligationsPageProps {
  params: Promise<{ awardId: string }>;
}

export async function generateMetadata(props: ObligationsPageProps): Promise<Metadata> {
  const { awardId } = await props.params;
  const session = await requireSession();
  const workspace = await getAwardWorkspace(awardId, session.organization.id);

  if (!workspace) return { title: "Obligation register", robots: { index: false, follow: false } };

  return {
    title: `Obligations — ${workspace.award.name}`,
    description: `Every requirement AwardLens found in ${workspace.award.name}, with the passage it came from and whether a person has confirmed it.`,
    robots: { index: false, follow: false },
  };
}

export default async function ObligationsPage(props: ObligationsPageProps) {
  const { awardId } = await props.params;
  const session = await requireSession();
  const workspace = await getAwardWorkspace(awardId, session.organization.id);

  if (!workspace) notFound();

  const { award, obligations, progress } = workspace;

  return (
    <div className="container-page pt-6">
      <Link
        href={`/app/awards/${award.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {award.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Obligation register</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {award.name}
            {award.funder ? ` · ${award.funder}` : ""}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-soft">
            {progress.total} active {progress.total === 1 ? "item" : "items"} ·{" "}
            {progress.confirmed} confirmed by a person ·{" "}
            {progress.needsReview} still awaiting review
            {progress.unverifiedSource > 0
              ? ` · ${progress.unverifiedSource} whose source could not be verified`
              : ""}
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/app/awards/${award.id}/review`}>
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Review queue
              {progress.needsReview > 0 ? (
                <span className="font-mono text-xs">({progress.needsReview})</span>
              ) : null}
            </Link>
          </Button>
        </div>
      </div>

      {progress.needsReview > 0 ? (
        <div className="mt-5 rounded-lg border border-ink-accent-subtle bg-ink-accent-subtle px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-accent">
            <span className="font-semibold">
              {progress.needsReview} {progress.needsReview === 1 ? "item has" : "items have"} not
              been reviewed by anyone yet.
            </span>{" "}
            Everything below is shown exactly as it was extracted. Nothing is treated as confirmed
            until you check it against the award document.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="exports-heading" className="mt-5" data-print="hide">
        <h2 id="exports-heading" className="sr-only">
          Export this register
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Plain anchors with `download`: these are file responses from a route
              handler, not client navigations. */}
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <a href={`/api/awards/${award.id}/export/csv`} download>
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Download CSV
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <a href={`/api/awards/${award.id}/export/ics`} download>
              <CalendarDays className="size-4" aria-hidden="true" />
              Download calendar (.ics)
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <a href={`/api/awards/${award.id}/export/json`} download>
              <FileJson className="size-4" aria-hidden="true" />
              Download JSON
            </a>
          </Button>
          <p className="basis-full text-xs leading-relaxed text-muted-foreground sm:basis-auto sm:max-w-md">
            The calendar file contains confirmed items that have a fixed date only — unconfirmed or
            undated requirements are left out rather than put in your diary as if they were settled.
          </p>
        </div>
      </section>

      <Register award={award} obligations={obligations} />
    </div>
  );
}
