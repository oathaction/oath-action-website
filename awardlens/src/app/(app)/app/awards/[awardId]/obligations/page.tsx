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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, ButtonRow } from "@/components/ui/button";

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

      <header className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="type-title">Obligation register</h1>
          <p className="type-small mt-1.5 text-muted-foreground">
            {award.name}
            {award.funder ? ` · ${award.funder}` : ""}
          </p>

          {/* The tally, set as figures rather than a sentence: three numbers a
              person can compare, with the words that say what they count. */}
          <p className="meta-row type-caption mt-3 font-normal text-muted-foreground">
            <span>
              <span className="tabular font-medium text-foreground">{progress.total}</span> active{" "}
              {progress.total === 1 ? "item" : "items"}
            </span>
            <span>
              <span className="tabular font-medium text-foreground">{progress.confirmed}</span>{" "}
              confirmed by a person
            </span>
            <span>
              <span className="tabular font-medium text-foreground">{progress.needsReview}</span>{" "}
              awaiting review
            </span>
            {progress.unverifiedSource > 0 ? (
              <span className="text-destructive">
                <span className="tabular font-medium">{progress.unverifiedSource}</span> whose
                source could not be verified
              </span>
            ) : null}
          </p>
        </div>

        <ButtonRow>
          <Button asChild variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/app/awards/${award.id}/review`}>
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Review queue
              {progress.needsReview > 0 ? (
                <span className="tabular font-mono text-xs">({progress.needsReview})</span>
              ) : null}
            </Link>
          </Button>
        </ButtonRow>
      </header>

      {progress.needsReview > 0 ? (
        /* Authority blue rather than amber: this is the product's standing
           position, not an alarm. --ink-accent on --ink-accent-subtle is
           10.85:1.

           Full width, with the sentence itself set to a reading measure inside
           it. Held to `measure-wide` the panel stopped two-thirds of the way
           across the page while the filter bar and every register row ran to
           the edge, so the one statement that frames the whole page read as an
           orphan. */
        <Alert
          role="note"
          variant="info"
          className="mt-5 border-ink-accent-border bg-ink-accent-subtle text-ink-accent"
        >
          <AlertDescription className="measure-wide leading-relaxed">
            <span className="font-semibold">
              Nothing here is confirmed until a person confirms it.
            </span>{" "}
            Everything below is shown exactly as it was extracted; check each item against the award
            document before you rely on it.
          </AlertDescription>
        </Alert>
      ) : null}

      <Register award={award} obligations={obligations} />

      {/*
       * Exports sit below the register, not above it.
       *
       * This page exists to be read and worked through; downloading is what you
       * do once you have. Three download buttons and a caveat paragraph in the
       * prime slot cost roughly a fifth of the first screen at 1280px and a
       * third of it at 390px, and pushed the first requirement below the fold.
       * The award workspace still offers the same files in its Exports card.
       */}
      <section
        aria-labelledby="exports-heading"
        className="mt-10 border-t border-border pt-5"
        data-print="hide"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="exports-heading" className="eyebrow shrink-0 text-muted-foreground">
            Export
          </h2>
          {/* Plain anchors with `download`: these are file responses from a route
              handler, not client navigations. */}
          <ButtonRow>
            <Button asChild variant="muted" size="sm" className="min-h-11 sm:min-h-8">
              <a href={`/api/awards/${award.id}/export/csv`} download>
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                Download CSV
              </a>
            </Button>
            <Button asChild variant="muted" size="sm" className="min-h-11 sm:min-h-8">
              <a href={`/api/awards/${award.id}/export/ics`} download>
                <CalendarDays className="size-4" aria-hidden="true" />
                Download calendar (.ics)
              </a>
            </Button>
            <Button asChild variant="muted" size="sm" className="min-h-11 sm:min-h-8">
              <a href={`/api/awards/${award.id}/export/json`} download>
                <FileJson className="size-4" aria-hidden="true" />
                Download JSON
              </a>
            </Button>
          </ButtonRow>
        </div>
        <p className="type-caption measure-wide mt-2 font-normal leading-relaxed text-muted-foreground">
          The calendar file contains confirmed items that have a fixed date only — unconfirmed or
          undated requirements are left out rather than put in your diary as if they were settled.
        </p>
      </section>
    </div>
  );
}
