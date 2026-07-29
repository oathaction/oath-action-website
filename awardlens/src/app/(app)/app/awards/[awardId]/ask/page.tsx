import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenCheck } from "lucide-react";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { INTERPRETATION_LABELS } from "@/lib/domain/types";
import { formatLocator } from "@/lib/documents/segment";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

      <div className="mt-4 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <h1 className="type-title">Ask this award</h1>
          <p className="type-lede measure mt-2 text-muted-foreground">
            Questions are answered only from this award&rsquo;s own documents. If the document
            doesn&rsquo;t address something, AwardLens says so instead of filling the gap.
          </p>

          <AskPanel awardId={awardId} />

          {exchanges.length > 0 ? (
            <section className="mt-10" aria-labelledby="previous-questions">
              <h2 id="previous-questions" className="eyebrow text-muted-foreground">
                Previous questions
              </h2>

              <div className="mt-3 space-y-5">
                {[...exchanges].reverse().map((exchange) => (
                  <article
                    key={exchange.id}
                    className="overflow-hidden rounded-lg border border-border bg-surface shadow-resting"
                  >
                    <div className="px-5 pb-4 pt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                        <h3 className="type-subhead min-w-0 flex-1 text-foreground">
                          {exchange.question}
                        </h3>
                        {/* Answered from the document is the ordinary case, so
                            it is quiet; "not addressed" and "uncertain" are the
                            two outcomes worth a filled pill. */}
                        <span className="shrink-0">
                          {exchange.answerType === "not_addressed" ? (
                            <Badge variant="warning" emphasis="solid">
                              Not addressed in this award
                            </Badge>
                          ) : exchange.answerType === "uncertain" ? (
                            <Badge variant="warning" emphasis="solid">
                              Uncertain
                            </Badge>
                          ) : (
                            <Badge variant="success" emphasis="quiet">
                              Answered from the document
                            </Badge>
                          )}
                        </span>
                      </div>

                      <div className="stack-sm type-body measure-wide mt-3 text-foreground-soft">
                        {exchange.answer.split("\n\n").map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>

                      <p className="type-caption mt-3 font-normal text-muted-foreground">
                        {INTERPRETATION_LABELS[exchange.interpretationLevel]}
                      </p>
                    </div>

                    {/* The passages the answer was drawn from, set on paper:
                        the same document surface the Evidence Rail uses, so a
                        quotation always looks quoted rather than restated. */}
                    {exchange.citations.length > 0 ? (
                      <div className="border-t border-paper-border bg-paper px-5 pb-4 pt-3">
                        <h4 className="eyebrow text-ink-document-soft">
                          {exchange.citations.length === 1
                            ? "Source passage"
                            : `Source passages (${exchange.citations.length})`}
                        </h4>
                        <div className="stack-md mt-2.5">
                          {exchange.citations.map((citation, index) => (
                            <figure key={index}>
                              <figcaption className="tabular font-mono text-[11.5px] font-medium tracking-[-0.01em] text-ink-document">
                                {formatLocator(citation.locatorType, citation.locatorValue)}
                              </figcaption>
                              <blockquote className="evidence-quote evidence-quote-hang mt-1 max-w-[66ch]">
                                &ldquo;{citation.excerpt}&rdquo;
                              </blockquote>
                            </figure>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {exchange.suggestedFunderQuestion ? (
                      <div className="border-t border-border-subtle bg-surface-sunken px-5 py-3.5">
                        <h4 className="eyebrow text-muted-foreground">
                          Suggested question for the funder
                        </h4>
                        <p className="type-small mt-1 text-foreground-soft">
                          {exchange.suggestedFunderQuestion}
                        </p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="mt-10 rounded-lg border border-dashed border-border-strong bg-surface/60 px-6 py-10">
              <p className="measure mx-auto text-center text-sm leading-relaxed text-muted-foreground">
                Answers will appear here, each one followed by the passages it was drawn from. You
                can check every claim against the document before you act on it.
              </p>
            </div>
          )}
        </div>

        <aside className="lg:pt-1">
          <Card tone="sunken" elevation="flat">
            <CardContent padding="tight" className="pt-3.5">
              <h2 className="type-subhead flex items-center gap-2 text-foreground">
                <BookOpenCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                How answers work
              </h2>
              <div className="stack-sm mt-2.5 text-xs leading-relaxed text-foreground-soft">
                <p>
                  AwardLens searches the stored text of this award and answers only from what it
                  finds, quoting the passages it used.
                </p>
                <p>
                  It will not tell you whether a cost is allowable or whether you are compliant —
                  those are judgements for your organisation and, where it matters, your funder or
                  adviser.
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
