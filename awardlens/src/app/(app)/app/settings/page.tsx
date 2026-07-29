import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { describeConfig } from "@/lib/env";
import { PLAN_ORDER, PLANS, planFor } from "@/lib/billing/plans";
import { REMINDER_OFFSETS } from "@/lib/domain/types";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Card, CardContent, CardDivider } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DeleteEverythingForm,
  NotificationForm,
  OrganizationForm,
  PlanButton,
  ProfileForm,
} from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Settings" };

/**
 * The spine. Six unrelated things live on this page and it used to present them
 * as six identical stacked boxes in a 780px column hard against the left edge
 * of a 1280px screen, with no way to tell what was below the fold or to get
 * there. A named index that stays put while the column scrolls is the cheapest
 * possible fix and the one a reference book would use.
 */
const SECTIONS = [
  { id: "profile", label: "Your profile" },
  { id: "organisation", label: "Organisation" },
  { id: "notifications", label: "Deadline reminders" },
  { id: "billing", label: "Plan" },
  { id: "privacy", label: "Your data" },
  { id: "system-status", label: "System status" },
] as const;

export default async function SettingsPage(props: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await props.searchParams;
  const session = await requireSession();
  const config = describeConfig();

  const [subscription, preferences, awards] = await Promise.all([
    db.getSubscription(session.organization.id),
    db.getNotificationPreferences(session.profile.id, session.organization.id),
    db.listAwards(session.organization.id),
  ]);

  const currentPlan = planFor(subscription);
  const credits = subscription?.awardCredits ?? 0;
  const limit = currentPlan.awardLimit === null ? null : currentPlan.awardLimit + credits;

  /**
   * Every configuration fact on the page, in one place.
   *
   * This card used to compete with three other amber notices — the global mode
   * banner, "no email provider", "CRON_SECRET is not set" — spread across two
   * unrelated sections. Four alarms on one page is the same as none, so the
   * facts moved here, where they can be read as a set, and the sections that
   * used to shout them now point at this one.
   */
  const systemRows = [
    {
      label: "Extraction",
      ok: config.aiMode === "live",
      value:
        config.aiMode === "live"
          ? `Live model (${config.aiModel})`
          : "Deterministic (no model configured)",
      note:
        config.aiMode === "live"
          ? null
          : "Extraction runs from a fixed rule set instead of a model. It is repeatable, and it will not read a document the way a live model would.",
    },
    {
      label: "Storage",
      ok: config.storageMode === "postgres",
      value: config.storageMode === "postgres" ? "Postgres" : "Local file store (ephemeral)",
      note:
        config.storageMode === "postgres"
          ? null
          : "Awards and documents are held in a local file store. They will not survive a redeploy. Set DATABASE_URL to persist them.",
    },
    {
      label: "Billing",
      ok: config.billingMode === "stripe",
      value: config.billingMode === "stripe" ? "Stripe" : "Development mode",
      note:
        config.billingMode === "stripe"
          ? null
          : "Plans are granted without payment and no card is collected. This mode refuses to grant anything in a production build.",
    },
    {
      label: "Email",
      ok: config.emailMode === "resend",
      value: config.emailMode === "resend" ? "Resend" : "Server log only",
      note:
        config.emailMode === "resend"
          ? null
          : "No email provider is configured, so reminders are written to the server log instead of being delivered. Set RESEND_API_KEY and EMAIL_FROM to send real email.",
    },
    {
      label: "Reminder schedule",
      ok: config.cronProtected,
      value: config.cronProtected ? "Protected" : "Disabled",
      note: config.cronProtected
        ? null
        : "CRON_SECRET is not set, so the scheduled reminder job is disabled. Reminders will be scheduled but not sent.",
    },
  ];

  const remindersDegraded = config.emailMode !== "resend" || !config.cronProtected;

  const deliveryNote = (
    <p className="text-[13px] leading-relaxed text-muted-foreground">
      Reminders are scheduled but not delivered in this deployment.{" "}
      <Link
        href="#system-status"
        className="font-medium text-primary underline decoration-primary/35 underline-offset-2 hover:decoration-primary"
      >
        See System status
      </Link>{" "}
      for what is missing.
    </p>
  );

  return (
    <div className="container-page pt-8 sm:pt-10">
      <div className="mx-auto max-w-[62rem] lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
        {/*
         * `self-start` is load-bearing: a grid item stretches to the row height
         * by default, so a sticky item fills its own grid area and has nowhere
         * to travel. Shrinking the item to its content leaves the tall grid
         * area as the containing block, which is the room sticky needs.
         */}
        <div className="lg:sticky lg:top-20 lg:self-start lg:pb-10">
          <h1 className="type-heading">Settings</h1>
          <p className="type-small measure mt-1.5 text-muted-foreground">
            Your account, your organisation, and how this deployment is configured.
          </p>

          <nav aria-label="Settings sections" className="mt-7 hidden lg:block">
            <ul className="border-l border-border">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 stack-xl lg:mt-0">
          {checkout === "success" ? (
            <Alert variant="primary">
              <AlertDescription>
                Payment received. Your plan is updated — it may take a few seconds to appear.
              </AlertDescription>
            </Alert>
          ) : checkout === "cancelled" ? (
            <Alert variant="info">
              <AlertDescription>Checkout cancelled. Nothing was charged.</AlertDescription>
            </Alert>
          ) : null}

          {/* ------------------------------------------------------ profile -- */}
          <Section
            id="profile"
            title="Your profile"
            description={
              <>
                Signed in as{" "}
                <span className="font-mono text-foreground-soft [overflow-wrap:anywhere]">
                  {session.profile.email}
                </span>
              </>
            }
          >
            {/* The form brings its own body padding and commit row. */}
            <Card>
              <ProfileForm fullName={session.profile.fullName ?? ""} />
            </Card>
          </Section>

          {/* ------------------------------------------------- organisation -- */}
          <Section
            id="organisation"
            title="Organisation"
            description="Awards, documents and obligations belong to this organisation. Nobody outside it can see them."
          >
            <Card>
              <OrganizationForm name={session.organization.name} />
            </Card>
          </Section>

          {/* -------------------------------------------------- reminders --- */}
          <Section
            id="notifications"
            title="Deadline reminders"
            description="Emails go out only for obligations you have confirmed and that have a date. Nothing unreviewed is ever emailed to you."
          >
            {/*
             * `deliveryNote` is one quiet line where there used to be two amber
             * boxes. The environment variables that fix it are operator
             * instructions, and they now live with every other operator
             * instruction, in System status.
             */}
            <Card>
              {currentPlan.emailReminders ? (
                <NotificationForm
                  enabled={preferences.enabled}
                  offsets={preferences.offsets}
                  allOffsets={[...REMINDER_OFFSETS]}
                  note={remindersDegraded ? deliveryNote : null}
                />
              ) : (
                <CardContent className="pt-5">
                  <Alert variant="quiet" role="note">
                    <AlertDescription>
                      Email reminders are included from the {PLANS.single_award.name} upwards. Your
                      register, calendar export and review workflow work on every plan.
                    </AlertDescription>
                  </Alert>
                  {remindersDegraded ? (
                    <>
                      <CardDivider />
                      {deliveryNote}
                    </>
                  ) : null}
                </CardContent>
              )}
            </Card>
          </Section>

          {/* ------------------------------------------------------- plan --- */}
          <Section
            id="billing"
            title="Plan"
            description={
              <>
                You are on <strong className="font-semibold text-foreground-soft">{currentPlan.name}</strong> —{" "}
                {awards.length} of {limit ?? "unlimited"} awards used.
                {credits > 0
                  ? ` Includes ${credits} purchased award ${credits === 1 ? "pack" : "packs"}.`
                  : ""}
              </>
            }
          >
            {/*
             * The one genuine warning on this page, and it sits where the
             * decision is made rather than in a banner at the top of every
             * screen: these buttons hand out entitlements without taking money.
             */}
            {config.billingMode === "development" ? (
              <Alert variant="warning" className="mb-4" role="note">
                <AlertTitle>Development billing mode</AlertTitle>
                <AlertDescription className="text-[13px] leading-relaxed">
                  Plans are granted immediately without payment, and no card is collected. This mode
                  refuses to grant anything in a production build. Configure Stripe before charging
                  anyone.
                </AlertDescription>
              </Alert>
            ) : null}

            <ul className="grid gap-3 sm:grid-cols-2">
              {PLAN_ORDER.map((planId) => {
                const plan = PLANS[planId];
                const isCurrent = plan.id === currentPlan.id;
                return (
                  <li key={plan.id} className="flex">
                    <Card
                      tone={isCurrent ? "primary" : "default"}
                      elevation={isCurrent ? "resting" : "flat"}
                      className="card-pad flex w-full flex-col"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="type-subhead text-[15px]">{plan.name}</h3>
                        {isCurrent ? (
                          <Badge variant="primary" size="xs">
                            Current
                          </Badge>
                        ) : null}
                      </div>
                      <p className="metric mt-1.5 text-2xl text-foreground">
                        {plan.price}
                        <span className="ml-1.5 font-mono text-xs font-normal tracking-normal text-muted-foreground">
                          {plan.cadence}
                        </span>
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {plan.tagline}
                      </p>
                      <ul className="mt-3.5 space-y-1.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs leading-relaxed">
                            <Check
                              className="mt-0.5 size-3 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      {!isCurrent && plan.id !== "demo" ? (
                        <div className="mt-auto pt-4">
                          <PlanButton planId={plan.id} planName={plan.name} />
                        </div>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ------------------------------------------------- your data ---- */}
          <Section
            id="privacy"
            title="Your data"
            description="Documents are held in private storage and are never publicly reachable. They are not used to train any model."
          >
            <Card>
              <CardContent className="pt-5">
                <h3 className="eyebrow text-muted-foreground">What AwardLens stores</h3>
                <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-foreground-soft">
                  {[
                    "The documents you upload, and the text extracted from them.",
                    "The obligations extracted, your edits, and your review decisions.",
                    "An activity log of actions taken, which never contains document text.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <StatusDot variant="neutral" className="mt-[7px]" />
                      {item}
                    </li>
                  ))}
                </ul>

                <CardDivider />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="measure text-[13px] leading-relaxed text-muted-foreground">
                    Deleting removes every award, document, obligation and citation. It cannot be
                    undone.
                  </p>
                  <DeleteEverythingForm organizationName={session.organization.name} />
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* ---------------------------------------------- system status --- */}
          <Section
            id="system-status"
            title="System status"
            description="How this deployment is configured. These are properties of the server, not of your account."
          >
            <Card tone="sunken" elevation="flat">
              <CardContent className="pt-5">
                <dl className="divide-y divide-border-subtle">
                  {systemRows.map((row) => (
                    <div
                      key={row.label}
                      className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-6"
                    >
                      <dt className="text-[13px] font-medium text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd className="min-w-0">
                        {/*
                         * The marker carries the state, the words carry the
                         * meaning. Setting five status lines in --warning turned
                         * the one panel on the page whose job is to be read
                         * calmly into a block of alarm colour — the "every row
                         * shouts, so no row shouts" defect, in a new place. It
                         * would read the same in a fully configured deployment,
                         * five green lines instead of five amber ones.
                         *
                         * The dot stays decorative because the state is already
                         * in the words — "Postgres" against "Local file store
                         * (ephemeral)" — and only a degraded row carries a note
                         * underneath, which is the strongest scanning cue here.
                         * --foreground 15.95:1 on --surface-sunken.
                         */}
                        <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                          <StatusDot variant={row.ok ? "success" : "warning"} />
                          {row.value}
                        </p>
                        {row.note ? (
                          <p className="measure-wide mt-1 text-xs leading-relaxed text-muted-foreground">
                            {row.note}
                          </p>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>

                {config.warnings.length > 0 ? (
                  <>
                    <CardDivider />
                    <h3 className="eyebrow text-muted-foreground">Configuration notes</h3>
                    <ul className="mt-2.5 space-y-2">
                      {config.warnings.map((warning) => (
                        <li
                          key={warning}
                          className="flex items-start gap-2.5 text-xs leading-relaxed text-foreground-soft"
                        >
                          <StatusDot variant="warning" className="mt-[7px]" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}

/**
 * Heading and description sit on the page, not inside the card. The card then
 * holds only the things you can operate, which is what stops six unrelated
 * settings from reading as six identical boxes.
 */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="type-subhead">
        {title}
      </h2>
      <p className="measure-wide mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
