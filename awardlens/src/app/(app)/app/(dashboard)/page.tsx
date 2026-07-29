import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookMarked,
  CalendarClock,
  CheckCheck,
  CircleHelp,
  Download,
  FileSearch,
  ListChecks,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getDashboardData, type DeadlineEntry } from "@/lib/awards/queries";
import { Button, ButtonRow } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { CATEGORY_META } from "@/lib/domain/types";
import { formatCurrency, formatIsoDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const data = await getDashboardData(session.organization.id);

  if (data.awards.length === 0) {
    return <FirstRun organizationName={session.organization.name} />;
  }

  return (
    <div className="container-page pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="stack-xs">
          <h1 className="type-heading">{session.organization.name}</h1>
          <p className="meta-row type-small text-muted-foreground">
            <span>
              {data.activeAwards.length} active{" "}
              {data.activeAwards.length === 1 ? "award" : "awards"}
            </span>
            <span>
              {data.awaitingReview} {data.awaitingReview === 1 ? "item" : "items"} awaiting review
            </span>
          </p>
        </div>
        <Button asChild>
          <Link href="/app/awards/new">
            <Plus className="size-4" aria-hidden="true" />
            Analyse an award
          </Link>
        </Button>
      </div>

      {data.awaitingReview > 0 ? (
        <p className="mt-6 rounded-lg border border-ink-accent-border bg-ink-accent-subtle px-4 py-3 text-sm leading-relaxed text-ink-accent">
          <span className="font-semibold">
            {data.awaitingReview} extracted {data.awaitingReview === 1 ? "item has" : "items have"}{" "}
            not been reviewed yet.
          </span>{" "}
          Nothing is treated as confirmed until you check it against the award document.
        </p>
      ) : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Overdue"
          value={data.overdue.length}
          tone={data.overdue.length > 0 ? "destructive" : "neutral"}
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Due in 30 days"
          value={data.dueIn30.length}
          tone={data.dueIn30.length > 0 ? "warning" : "neutral"}
          icon={<CalendarClock className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Awaiting review"
          value={data.awaitingReview}
          tone="neutral"
          icon={<FileSearch className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          label="Source needs checking"
          value={data.unverifiedSources}
          tone={data.unverifiedSources > 0 ? "warning" : "neutral"}
          icon={<ShieldAlert className="size-4" aria-hidden="true" />}
        />
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="type-subhead">
            What&rsquo;s coming up
          </h2>

          {data.overdue.length + data.dueIn30.length + data.dueIn60.length + data.dueIn90.length ===
          0 ? (
            <EmptyState
              className="mt-4"
              headingLevel={3}
              icon={<CalendarClock />}
              title="No dated deadlines in the next 90 days"
              description="Requirements without a fixed calendar date still appear in each award's register."
            />
          ) : (
            <div className="mt-4 stack-lg">
              <DeadlineGroup title="Overdue" entries={data.overdue} tone="destructive" />
              <DeadlineGroup title="Next 30 days" entries={data.dueIn30} tone="warning" />
              <DeadlineGroup title="31–60 days" entries={data.dueIn60} tone="neutral" />
              <DeadlineGroup title="61–90 days" entries={data.dueIn90} tone="neutral" />
            </div>
          )}
        </section>

        <div className="stack-xl">
          <section aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="type-subhead">
              Open questions
            </h2>
            {data.openQuestions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No unresolved questions right now.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {data.openQuestions.map(({ obligation, award }) => (
                  <li key={obligation.id}>
                    <Card className="card-pad-tight">
                      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground-soft">
                        <CircleHelp
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {obligation.clarificationQuestion}
                      </p>
                      <Link
                        href={`/app/awards/${award.id}/review`}
                        className="mt-2 inline-flex items-center gap-1 pl-[26px] text-xs font-medium text-primary hover:underline"
                      >
                        {award.name}
                        <ArrowRight className="size-3" aria-hidden="true" />
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="awards-heading">
            <h2 id="awards-heading" className="type-subhead">
              Your awards
            </h2>
            <ul className="mt-4 space-y-2">
              {data.awards.map((award) => (
                <li key={award.id}>
                  <Link
                    href={`/app/awards/${award.id}`}
                    className="card-pad-tight block rounded-lg border border-border bg-surface shadow-resting transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-raised"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{award.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {award.funder ?? "Funder not identified"}
                        </p>
                      </div>
                      {award.status === "failed" ? (
                        <Badge variant="destructive" size="xs">
                          Failed
                        </Badge>
                      ) : award.status === "processing" ? (
                        <Badge variant="warning" size="xs">
                          Processing
                        </Badge>
                      ) : null}
                    </div>
                    <p className="tabular mt-2 font-mono text-xs text-muted-foreground">
                      {formatCurrency(award.awardAmount, award.currency)}
                      {award.endDate
                        ? ` · ends ${formatIsoDate(award.endDate, { year: "numeric", month: "short", day: "numeric" })}`
                        : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "destructive";
  icon: React.ReactNode;
}) {
  const active = value > 0;
  const ink =
    !active
      ? "text-muted-foreground"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";

  return (
    <div className="card-pad-tight rounded-lg border border-border bg-surface shadow-resting">
      <dt className="eyebrow flex items-center gap-2 text-muted-foreground">
        <span aria-hidden="true" className={active ? ink : "text-border-control"}>
          {icon}
        </span>
        {label}
      </dt>
      <dd className={`metric tabular mt-2.5 text-[28px] ${ink}`}>{value}</dd>
    </div>
  );
}

function DeadlineGroup({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: DeadlineEntry[];
  tone: "neutral" | "warning" | "destructive";
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="eyebrow flex items-baseline gap-2 text-muted-foreground">
        {title}
        <span className="tabular font-normal">{entries.length}</span>
      </h3>
      <ul className="mt-2.5 divide-y divide-border-subtle overflow-hidden rounded-lg border border-border bg-surface shadow-resting">
        {entries.slice(0, 12).map(({ obligation, award, daysAway }) => (
          <li key={obligation.id}>
            <Link
              href={`/app/awards/${award.id}/obligations#obligation-${obligation.id}`}
              className="flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{obligation.title}</p>
                <p className="meta-row mt-1 text-xs text-muted-foreground">
                  <span className="truncate">{award.name}</span>
                  <span>{CATEGORY_META[obligation.category].label}</span>
                  {obligation.reviewStatus === "needs_review" ? <span>not yet reviewed</span> : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular font-mono text-xs font-medium">
                  {formatIsoDate(obligation.dueDate, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p
                  className={`tabular mt-0.5 font-mono text-xs ${
                    tone === "destructive"
                      ? "text-destructive"
                      : tone === "warning"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }`}
                >
                  {daysAway < 0 ? `${Math.abs(daysAway)}d overdue` : `in ${daysAway}d`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The first screen of a new organisation.
 *
 * It used to be a heading, two buttons and one card pinned to the top of a
 * 900px viewport, with about 300px of nothing under it and the footer stranded
 * at the bottom. An empty state is the only screen every single customer is
 * guaranteed to see, so it is worth composing: the invitation on the left at
 * full weight, what actually happens next set as three numbered steps, and what
 * comes out of it in the one raised object on the page.
 *
 * Step three is the product's whole posture and is why it is here rather than
 * in a tooltip: nothing AwardLens extracts counts until a person has checked it.
 */
const OUTPUTS = [
  {
    icon: <ListChecks aria-hidden="true" />,
    text: "An obligation register with due dates, owners and priorities",
  },
  {
    icon: <BookMarked aria-hidden="true" />,
    text: "A source citation for every extracted item, down to the page",
  },
  {
    icon: <CheckCheck aria-hidden="true" />,
    text: "A review queue so you confirm or correct each one",
  },
  {
    icon: <Download aria-hidden="true" />,
    text: "Calendar, CSV and JSON exports you can use outside AwardLens",
  },
] as const;

const STEPS = [
  {
    title: "Upload the document",
    body: "A PDF, a Word file, or text pasted straight out of an email. One award at a time.",
  },
  {
    title: "AwardLens reads it",
    body: "It pulls out deadlines, deliverables, restrictions and reporting requirements, and records the sentence each one came from.",
  },
  {
    title: "You confirm every item",
    body: "Nothing is treated as confirmed until you have checked it against the document yourself.",
  },
] as const;

function FirstRun({ organizationName }: { organizationName: string }) {
  return (
    <div className="container-page pt-11 sm:pt-14">
      <div className="grid items-start gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow text-primary">Getting started</p>
          <h1 className="type-title mt-2.5">Welcome to {organizationName}</h1>
          <p className="type-lede measure mt-4 text-foreground-soft">
            Upload a grant agreement, award letter or notice of award. AwardLens will read it and
            build a register of deadlines, deliverables, restrictions and reporting requirements —
            each one linked back to the page it came from.
          </p>

          <ButtonRow className="mt-7 gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/app/awards/new">
                <Plus className="size-4" aria-hidden="true" />
                Analyse your first award
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link href="/demo">See a worked sample</Link>
            </Button>
          </ButtonRow>
        </div>

        <Card elevation="raised" className="lg:mt-1">
          <CardHeader padding="roomy" className="pb-4">
            <CardTitle>What you&rsquo;ll get</CardTitle>
          </CardHeader>
          <CardContent padding="roomy">
            <ul className="stack-md">
              {OUTPUTS.map((output) => (
                <li key={output.text} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground [&>svg]:size-[15px]"
                  >
                    {output.icon}
                  </span>
                  <span className="text-sm leading-relaxed text-foreground-soft">
                    {output.text}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="steps-heading" className="mt-14 border-t border-border pt-7">
        <h2 id="steps-heading" className="eyebrow text-muted-foreground">
          What happens next
        </h2>
        <ol className="mt-5 grid gap-x-12 gap-y-7 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="stack-sm">
              <p aria-hidden="true" className="tabular font-mono text-[13px] font-medium text-primary">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
