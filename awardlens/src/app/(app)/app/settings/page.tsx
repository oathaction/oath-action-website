import type { Metadata } from "next";
import { Check } from "lucide-react";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { describeConfig } from "@/lib/env";
import { PLAN_ORDER, PLANS, planFor } from "@/lib/billing/plans";
import { REMINDER_OFFSETS } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DeleteEverythingForm,
  NotificationForm,
  OrganizationForm,
  PlanButton,
  ProfileForm,
} from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Settings" };

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

  return (
    <div className="container-page pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {checkout === "success" ? (
        <Alert variant="primary" className="mt-4">
          <AlertDescription>
            Payment received. Your plan is updated — it may take a few seconds to appear.
          </AlertDescription>
        </Alert>
      ) : checkout === "cancelled" ? (
        <Alert variant="info" className="mt-4">
          <AlertDescription>Checkout cancelled. Nothing was charged.</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid max-w-4xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>
              Signed in as <span className="font-mono">{session.profile.email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm fullName={session.profile.fullName ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
            <CardDescription>
              Awards, documents and obligations belong to this organisation. Nobody outside it can
              see them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationForm name={session.organization.name} />
          </CardContent>
        </Card>

        <Card id="notifications">
          <CardHeader>
            <CardTitle>Deadline reminders</CardTitle>
            <CardDescription>
              Emails go out only for obligations you have confirmed and that have a date. Nothing
              unreviewed is ever emailed to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentPlan.emailReminders ? (
              <NotificationForm
                enabled={preferences.enabled}
                offsets={preferences.offsets}
                allOffsets={[...REMINDER_OFFSETS]}
              />
            ) : (
              <Alert variant="info">
                <AlertDescription>
                  Email reminders are included from the {PLANS.single_award.name} upwards. Your
                  register, calendar export and review workflow work on every plan.
                </AlertDescription>
              </Alert>
            )}

            {config.emailMode === "console" ? (
              <Alert variant="warning" className="mt-4">
                <AlertDescription className="text-xs">
                  No email provider is configured, so reminders are written to the server log
                  instead of being delivered. Set RESEND_API_KEY and EMAIL_FROM to send real email.
                </AlertDescription>
              </Alert>
            ) : null}
            {!config.cronProtected ? (
              <Alert variant="warning" className="mt-4">
                <AlertDescription className="text-xs">
                  CRON_SECRET is not set, so the scheduled reminder job is disabled. Reminders will
                  be scheduled but not sent.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card id="billing">
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>
              You are on <strong>{currentPlan.name}</strong> — {awards.length} of{" "}
              {limit ?? "unlimited"} awards used.
              {credits > 0 ? ` Includes ${credits} purchased award ${credits === 1 ? "pack" : "packs"}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {config.billingMode === "development" ? (
              <Alert variant="warning" className="mb-4">
                <AlertTitle>Development billing mode</AlertTitle>
                <AlertDescription className="text-xs">
                  Plans are granted immediately without payment, and no card is collected. This
                  mode refuses to grant anything in a production build. Configure Stripe before
                  charging anyone.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {PLAN_ORDER.map((planId) => {
                const plan = PLANS[planId];
                const isCurrent = plan.id === currentPlan.id;
                return (
                  <div
                    key={plan.id}
                    className={`rounded-lg border p-4 ${
                      isCurrent ? "border-primary bg-primary-subtle" : "border-border bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{plan.name}</h3>
                      {isCurrent ? <Badge variant="primary">Current</Badge> : null}
                    </div>
                    <p className="mt-1 font-mono text-lg font-semibold">
                      {plan.price}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {plan.cadence}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-1.5 text-xs">
                          <Check
                            className="mt-0.5 size-3 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {!isCurrent && plan.id !== "demo" ? (
                      <PlanButton planId={plan.id} planName={plan.name} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card id="privacy">
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>
              Documents are held in private storage and are never publicly reachable. They are not
              used to train any model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted px-4 py-3 text-sm text-foreground-soft">
              <p className="font-medium text-foreground">What AwardLens stores</p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                <li>The documents you upload, and the text extracted from them.</li>
                <li>The obligations extracted, your edits, and your review decisions.</li>
                <li>An activity log of actions taken, which never contains document text.</li>
              </ul>
            </div>

            <DeleteEverythingForm organizationName={session.organization.name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System status</CardTitle>
            <CardDescription>How this deployment is configured.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <StatusRow
                label="Extraction"
                value={config.aiMode === "live" ? `Live model (${config.aiModel})` : "Deterministic (no model configured)"}
                ok={config.aiMode === "live"}
              />
              <StatusRow
                label="Storage"
                value={config.storageMode === "supabase" ? "Supabase Postgres" : "Local file store"}
                ok={config.storageMode === "supabase"}
              />
              <StatusRow
                label="Billing"
                value={config.billingMode === "stripe" ? "Stripe" : "Development mode"}
                ok={config.billingMode === "stripe"}
              />
              <StatusRow
                label="Email"
                value={config.emailMode === "resend" ? "Resend" : "Server log only"}
                ok={config.emailMode === "resend"}
              />
            </dl>

            {config.warnings.length > 0 ? (
              <Alert variant="warning" className="mt-4">
                <AlertTitle>Configuration notes</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                    {config.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-xs font-medium ${ok ? "text-success" : "text-warning"}`}>{value}</dd>
    </div>
  );
}
