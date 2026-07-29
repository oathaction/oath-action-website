import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleHelp,
  FileSearch,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { requireSession } from "@/lib/auth";
import { getDashboardData, type DeadlineEntry } from "@/lib/awards/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_META } from "@/lib/domain/types";
import { formatCurrency, formatIsoDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const data = await getDashboardData(session.organization.id);

  if (data.awards.length === 0) {
    return <EmptyState organizationName={session.organization.name} />;
  }

  return (
    <div className="container-page pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {session.organization.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.activeAwards.length} active{" "}
            {data.activeAwards.length === 1 ? "award" : "awards"} ·{" "}
            {data.awaitingReview} {data.awaitingReview === 1 ? "item" : "items"} awaiting review
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
        <div className="mt-6 rounded-lg border border-ink-accent-subtle bg-ink-accent-subtle px-4 py-3">
          <p className="text-sm text-ink-accent">
            <span className="font-semibold">
              {data.awaitingReview} extracted {data.awaitingReview === 1 ? "item has" : "items have"}{" "}
              not been reviewed yet.
            </span>{" "}
            Nothing is treated as confirmed until you check it against the award document.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="text-lg font-semibold tracking-tight">
            What&rsquo;s coming up
          </h2>

          {data.overdue.length + data.dueIn30.length + data.dueIn60.length + data.dueIn90.length ===
          0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-6 text-sm text-muted-foreground">
              No dated deadlines in the next 90 days. Requirements without a fixed calendar date
              still appear in each award&rsquo;s register.
            </p>
          ) : (
            <div className="mt-3 space-y-6">
              <DeadlineGroup title="Overdue" entries={data.overdue} tone="destructive" />
              <DeadlineGroup title="Next 30 days" entries={data.dueIn30} tone="warning" />
              <DeadlineGroup title="31–60 days" entries={data.dueIn60} tone="neutral" />
              <DeadlineGroup title="61–90 days" entries={data.dueIn90} tone="neutral" />
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="text-lg font-semibold tracking-tight">
              Open questions
            </h2>
            {data.openQuestions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No unresolved questions right now.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.openQuestions.map(({ obligation, award }) => (
                  <li
                    key={obligation.id}
                    className="rounded-lg border border-border bg-surface p-3.5"
                  >
                    <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground-soft">
                      <CircleHelp
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {obligation.clarificationQuestion}
                    </p>
                    <Link
                      href={`/app/awards/${award.id}/review`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {award.name}
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="awards-heading">
            <h2 id="awards-heading" className="text-lg font-semibold tracking-tight">
              Your awards
            </h2>
            <ul className="mt-3 space-y-2">
              {data.awards.map((award) => (
                <li key={award.id}>
                  <Link
                    href={`/app/awards/${award.id}`}
                    className="block rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-border-strong hover:bg-muted"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{award.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {award.funder ?? "Funder not identified"}
                        </p>
                      </div>
                      {award.status === "failed" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : award.status === "processing" ? (
                        <Badge variant="warning">Processing</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {formatCurrency(award.awardAmount, award.currency)}
                      {award.endDate ? ` · ends ${formatIsoDate(award.endDate, { year: "numeric", month: "short", day: "numeric" })}` : ""}
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span
            className={
              tone === "destructive"
                ? "text-destructive"
                : tone === "warning"
                  ? "text-warning"
                  : "text-muted-foreground"
            }
          >
            {icon}
          </span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`font-mono text-3xl font-semibold ${
            value === 0
              ? "text-muted-foreground"
              : tone === "destructive"
                ? "text-destructive"
                : tone === "warning"
                  ? "text-warning"
                  : "text-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({entries.length})
      </h3>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {entries.slice(0, 12).map(({ obligation, award, daysAway }) => (
          <li key={obligation.id}>
            <Link
              href={`/app/awards/${award.id}/obligations#obligation-${obligation.id}`}
              className="flex items-start gap-3 p-3.5 transition-colors hover:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{obligation.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {award.name} · {CATEGORY_META[obligation.category].label}
                  {obligation.reviewStatus === "needs_review" ? " · not yet reviewed" : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-medium">
                  {formatIsoDate(obligation.dueDate, { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p
                  className={`font-mono text-xs ${
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

function EmptyState({ organizationName }: { organizationName: string }) {
  return (
    <div className="container-page pt-16">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to {organizationName}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Upload a grant agreement, award letter or notice of award. AwardLens will read it and
          build a register of deadlines, deliverables, restrictions and reporting requirements —
          each one linked back to the page it came from.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/app/awards/new">
              <Plus className="size-4" aria-hidden="true" />
              Analyse your first award
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/demo">See a worked sample</Link>
          </Button>
        </div>

        <div className="mt-10 rounded-lg border border-border bg-surface p-5 text-left">
          <h2 className="text-sm font-semibold">What you&rsquo;ll get</h2>
          <ul className="mt-3 space-y-2 text-sm text-foreground-soft">
            {[
              "An obligation register with due dates, owners and priorities",
              "A source citation for every extracted item, down to the page",
              "A review queue so you confirm or correct each one",
              "Calendar, CSV and JSON exports you can use outside AwardLens",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
