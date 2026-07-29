import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenCheck, CircleHelp, Quote } from "lucide-react";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { INTERPRETATION_LABELS } from "@/lib/domain/types";
import { formatLocator } from "@/lib/documents/segment";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AskPanel } from "@/components/award/ask-panel";

export const metadata: Metadata = { title: "Ask this award" };

export default async function AskPage(props: {
  params: Promise<{ awardId: string }>;
}) {
  const { awardId } = await props.params;
  const session = await requireSession();

  const award = await db.getAward(awardId, session.organization.id);
  if (!award) notFound();

  const exchanges = await db.listAskExchanges(awardId, session.organization.id);

  return (
    <div className="container-page pt-6">
      <Link
        href={`/app/awards/${awardId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {award.name}
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask this award</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Questions are answered only from this award&rsquo;s own documents. If the document
            doesn&rsquo;t address something, AwardLens says so instead of filling the gap.
          </p>

          <AskPanel awardId={awardId} />

          {exchanges.length > 0 ? (
            <section className="mt-8 space-y-6" aria-label="Previous questions">
              {[...exchanges].reverse().map((exchange) => (
                <article
                  key={exchange.id}
                  className="rounded-lg border border-border bg-surface p-5"
                >
                  <h2 className="flex items-start gap-2 text-sm font-semibold">
                    <CircleHelp
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {exchange.question}
                  </h2>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {exchange.answerType === "not_addressed" ? (
                      <Badge variant="warning">Not addressed in this award</Badge>
                    ) : exchange.answerType === "uncertain" ? (
                      <Badge variant="warning">Uncertain</Badge>
                    ) : (
                      <Badge variant="success">Answered from the document</Badge>
                    )}
                    <Badge variant="outline">
                      {INTERPRETATION_LABELS[exchange.interpretationLevel]}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-foreground-soft">
                    {exchange.answer.split("\n\n").map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>

                  {exchange.citations.length > 0 ? (
                    <div className="mt-4 space-y-3 border-t border-border pt-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Quote className="size-3" aria-hidden="true" />
                        Sources
                      </p>
                      {exchange.citations.map((citation, index) => (
                        <figure key={index}>
                          <figcaption className="text-xs font-medium text-muted-foreground">
                            {formatLocator(citation.locatorType, citation.locatorValue)}
                          </figcaption>
                          <blockquote className="evidence-quote mt-1 border-l-2 border-border-strong pl-3">
                            &ldquo;{citation.excerpt}&rdquo;
                          </blockquote>
                        </figure>
                      ))}
                    </div>
                  ) : null}

                  {exchange.suggestedFunderQuestion ? (
                    <div className="mt-4 rounded-md bg-muted px-3 py-2.5">
                      <p className="text-xs font-semibold text-foreground">
                        Suggested question for the funder
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground-soft">
                        {exchange.suggestedFunderQuestion}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Alert variant="info">
            <AlertDescription className="space-y-2 text-xs leading-relaxed">
              <p className="flex items-center gap-1.5 font-semibold">
                <BookOpenCheck className="size-3.5" aria-hidden="true" />
                How answers work
              </p>
              <p>
                AwardLens searches the stored text of this award and answers only from what it
                finds, quoting the passages it used.
              </p>
              <p>
                It will not tell you whether a cost is allowable or whether you are compliant —
                those are judgements for your organisation and, where it matters, your funder or
                adviser.
              </p>
            </AlertDescription>
          </Alert>
        </aside>
      </div>
    </div>
  );
}
