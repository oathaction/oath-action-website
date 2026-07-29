import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Worked sample
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          What AwardLens produces from a grant agreement
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Below is the actual output of running AwardLens over a synthetic{" "}
          {pageCount}-page foundation grant agreement. Every item was extracted by the same
          pipeline your own documents go through, and every quotation was matched back to the
          source text before it was allowed to appear.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-border bg-surface p-5">
        <SampleFact label="Funder" value={profile.funder ?? "Not stated"} />
        <SampleFact label="Amount" value={formatCurrency(profile.awardAmount, profile.currency ?? "USD")} />
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
      </div>

      <Alert variant="info" className="mt-6 max-w-3xl">
        <AlertDescription className="text-sm leading-relaxed">
          Notice that every item says <strong>Needs review</strong>. AwardLens never marks its own
          output as confirmed — a person checks each one against the source passage shown beneath
          it. Items whose wording is relative rather than a fixed date keep the document&rsquo;s
          own words instead of being converted into a deadline we cannot justify.
        </AlertDescription>
      </Alert>

      <section className="mt-10" aria-labelledby="sample-register">
        <h2 id="sample-register" className="text-xl font-semibold tracking-tight">
          The obligation register
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {obligations.map((obligation) => (
            <EvidenceRail key={obligation.id} obligation={obligation} />
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-lg border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight">
          Run this on your own award
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Upload a text-based PDF, a Word document, or paste the text. Your first award is free,
          and your document stays private to your organisation.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/app/awards/new">
              Analyse an award
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          This sample is fictional. Any resemblance to a real funder, recipient or award number is
          coincidental.
        </p>
      </section>
    </div>
  );
}

function SampleFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-medium">{value}</p>
    </div>
  );
}
