import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, UserCheck } from "lucide-react";

import { parsePlainText } from "@/lib/documents/parse";
import { segmentBlocks } from "@/lib/documents/segment";
import { deterministicObligations, deterministicProfile } from "@/lib/ai/fixtures";
import { resolveCitations } from "@/lib/ai/citations";
import { consolidateCandidates } from "@/lib/ai/consolidate";
import { computeInternalDueDate } from "@/lib/domain/dates";
import { SAMPLE_AWARD_TEXT } from "@/lib/samples/sample-award";
import type { ObligationWithCitations } from "@/lib/domain/types";
import { EvidenceRail } from "@/components/evidence/evidence-rail";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency, formatIsoDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Worked sample",
  description:
    "See exactly what AwardLens produces from a grant agreement — obligations, due dates and the source passage behind each one.",
};

/**
 * A worked sample, built by running the real pipeline over a synthetic award at
 * build time. Nothing here is mocked up: these are genuine extraction outputs
 * with genuine citations resolved against the document text, which is the whole
 * point of showing it.
 */
export const dynamic = "force-static";

function buildSample(): {
  obligations: ObligationWithCitations[];
  profile: ReturnType<typeof deterministicProfile>;
  pageCount: number;
} {
  const parsed = parsePlainText(SAMPLE_AWARD_TEXT);
  const segments = segmentBlocks(parsed.blocks);
  const profile = deterministicProfile(segments);

  const candidates = deterministicObligations(segments).map((candidate) => ({
    candidate,
    citations: resolveCitations(candidate.citations, segments).citations,
    origin: "extracted" as const,
  }));

  const consolidated = consolidateCandidates(
    candidates.filter((entry) => entry.citations.some((citation) => citation.segmentId)),
  );

  const obligations: ObligationWithCitations[] = consolidated.map((item, index) => ({
    id: `sample-${index}`,
    awardId: "sample",
    organizationId: "sample",
    category: item.category,
    title: item.title,
    description: item.description,
    originalDateText: item.originalDateText,
    dueDate: item.dueDate,
    recurrence: item.recurrence,
    internalDueDate: computeInternalDueDate(
      item.dueDate,
      item.suggestedInternalLeadDays,
      item.category,
      item.priority,
    ),
    suggestedOwnerRole: item.suggestedOwnerRole,
    assignedUserId: null,
    priority: item.priority,
    confidence: item.confidence,
    reviewStatus: "needs_review",
    interpretationLevel: item.interpretationLevel,
    consequence: item.consequence,
    clarificationQuestion: item.clarificationQuestion,
    sourceStatus: "verified",
    notes: null,
    dateConflicts: item.dateConflicts,
    origin: "extracted",
    createdAt: "",
    updatedAt: "",
    citations: item.citations.map((citation, citationIndex) => ({
      id: `sample-${index}-${citationIndex}`,
      obligationId: `sample-${index}`,
      documentSegmentId: citation.segmentId,
      locatorType: citation.locatorType,
      locatorValue: citation.locatorValue,
      excerpt: citation.excerpt,
      startOffset: citation.startOffset,
      endOffset: citation.endOffset,
      matchScore: citation.matchScore,
      createdAt: "",
    })),
  }));

  return { obligations, profile, pageCount: parsed.pageCount ?? 0 };
}

export default function DemoPage() {
  const { obligations, profile, pageCount } = buildSample();
  const dated = obligations.filter((obligation) => obligation.dueDate).length;

  return (
    <>
      {/*
        A page opening, so it takes the page-opening cadence. At `section-tight`
        the h1 sat 56px under the header while the h1 on / and /pricing sat at
        121px, which made this page read as a fragment of another one.
      */}
      <section>
        <div className="container-page section">
          <div className="measure-wide">
            <p className="eyebrow text-primary">Worked sample</p>
            <h1 className="type-title mt-4">What AwardLens produces from a grant agreement</h1>
            <p className="type-lede mt-5 text-foreground-soft">
              Below is the actual output of running AwardLens over a synthetic{" "}
              {pageCount}-page foundation grant agreement. Every item was extracted by the same
              pipeline your own documents go through, and every quotation was matched back to the
              source text before it was allowed to appear.
            </p>
          </div>

          <dl className="card-pad-roomy mt-10 grid grid-cols-2 gap-x-8 gap-y-6 rounded-lg border border-border bg-surface shadow-resting sm:grid-cols-3 lg:grid-cols-5">
            {/*
              The funder name is the only long value in the strip. In two
              columns it wrapped to three lines and left the cell beside it
              hanging, so at that width it takes the full row instead.
            */}
            <SampleFact
              className="col-span-2 sm:col-span-1"
              label="Funder"
              value={profile.funder ?? "Not stated"}
            />
            <SampleFact
              label="Amount"
              value={formatCurrency(profile.awardAmount, profile.currency ?? "USD")}
            />
            <SampleFact
              label="Period"
              value={
                profile.startDate
                  ? `${formatIsoDate(profile.startDate, { month: "short", year: "numeric" })} – ${formatIsoDate(profile.endDate, { month: "short", year: "numeric" })}`
                  : "Not stated"
              }
            />
            <SampleFact label="Obligations found" value={String(obligations.length)} />
            <SampleFact label="With a firm date" value={String(dated)} />
          </dl>

          <Alert
            variant="info"
            role="note"
            icon={<UserCheck />}
            className="mt-6 max-w-3xl"
          >
            <AlertTitle>Every item still says Needs review</AlertTitle>
            <AlertDescription>
              <p>
                AwardLens never marks its own output as confirmed — a person checks each one
                against the source passage shown beneath it. Items whose wording is relative
                rather than a fixed date keep the document&rsquo;s own words instead of being
                converted into a deadline we cannot justify.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <section aria-labelledby="sample-register" className="border-t border-border bg-surface-sunken">
        <div className="container-page section-tight">
          <h2 id="sample-register" className="type-heading">
            The obligation register
          </h2>
          <p className="type-small measure-wide mt-3 text-muted-foreground">
            {obligations.length} items, each one shown with the passage it was drawn from.
          </p>
          {/*
            Columns rather than a two-up grid. In a grid every card stretches to
            the height of its taller neighbour, which left 80–130px of hollow
            inside three of these thirteen cards — a card with a void under its
            last line reads as a card that failed to load. Column flow lets each
            card end where its content ends, and reading order (down column one,
            then column two) is the order a register is read in anyway.
          */}
          <div className="mt-8 lg:columns-2 lg:gap-5">
            {obligations.map((obligation) => (
              <div key={obligation.id} className="mb-5 break-inside-avoid">
                <EvidenceRail obligation={obligation} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink-accent">
        <div className="container-page section">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between md:gap-12">
            <div className="max-w-2xl">
              <h2 className="type-title text-white">Run this on your own award</h2>
              <p className="type-lede mt-4 text-white/80">
                Upload a text-based PDF, a Word document, or paste the text. Your first award is
                free, and your document stays private to your organisation.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-surface text-ink-accent hover:bg-muted active:bg-surface-sunken focus-visible:outline-white"
              >
                <Link href="/app/awards/new">
                  Analyse an award
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="border border-white/40 text-white hover:bg-white/10 hover:text-white active:bg-white/15 focus-visible:outline-white"
              >
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>

          <p className="type-caption mt-10 flex items-start gap-2 border-t border-white/20 pt-5 text-white/70">
            <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            This sample is fictional. Any resemblance to a real funder, recipient or award number
            is coincidental.
          </p>
        </div>
      </section>
    </>
  );
}

function SampleFact({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {/*
        Two columns on a phone is narrow enough that "Obligations found" wraps
        while "With a firm date" does not, which knocked the two figures beside
        each other off a common baseline. One line of reserved height fixes the
        row; above `sm` no label wraps and the reservation is dropped.
      */}
      <dt className="eyebrow min-h-8 text-muted-foreground sm:min-h-0">{label}</dt>
      <dd className="metric tabular mt-2 text-lg leading-snug sm:text-xl">{value}</dd>
    </div>
  );
}
