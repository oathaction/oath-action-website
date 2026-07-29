import type { Metadata } from "next";
import Link from "next/link";
import { Check, Mail, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/navigation";
import { PLAN_ORDER, PLANS, type Plan } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "AwardLens pricing. Analyse one award for free, add a single award pack, or take a monthly plan for a portfolio of grants. Email deadline reminders are included on paid plans.",
};

const PLAN_LIST: Plan[] = PLAN_ORDER.map((id) => PLANS[id]);

function awardLimitLabel(plan: Plan): string {
  if (plan.awardLimit === null) return "Unmetered within fair use";
  return plan.awardLimit === 1 ? "One award analysis" : `Up to ${plan.awardLimit} awards`;
}

function billingLabel(plan: Plan): string {
  switch (plan.mode) {
    case "free":
      return "No payment";
    case "payment":
      return "One-time payment";
    case "subscription":
      return "Monthly subscription";
  }
}

const PRICING_FAQ = [
  {
    value: "what-counts",
    question: "What counts as one award analysis?",
    answer:
      "One award document processed into a register. Reviewing it, editing it, assigning owners, exporting it and printing it cost nothing further — you are only metered on the documents you analyse. An amendment analysed as its own document counts as another award.",
  },
  {
    value: "free-expiry",
    question: "Does the free tier expire?",
    answer:
      "No. It is limited by awards rather than by time. One award, the full register with source citations, review and confirmation, and CSV, calendar and JSON export.",
  },
  {
    value: "reminders",
    question: "Do I need a paid plan for email reminders?",
    answer:
      "Yes. Email deadline reminders are part of the paid plans. On the free tier you can still export the deadline calendar as an .ics file and let your own calendar do the reminding.",
  },
  {
    value: "pack",
    question: "Is the Single Award Pack a subscription?",
    answer:
      "No. It is a one-time payment that adds an award analysis to your account rather than starting a recurring charge. If you later need a portfolio under control, a monthly plan raises the ongoing limit instead.",
  },
  {
    value: "limit",
    question: "What happens when I reach my award limit?",
    answer:
      "Nothing you already have goes away. Your existing registers, exports and reminders keep working. AwardLens stops you starting a new analysis and tells you which plan would cover it.",
  },
  {
    value: "consultant",
    question: "I am a consultant working across several clients. Which plan?",
    answer: `${PLANS.team.name}. It covers ${PLANS.team.awardLimit} awards and a shared organisation workspace, so a client's register can outlive the engagement.`,
  },
  {
    value: "currency",
    question: "Are prices in US dollars?",
    answer:
      "Yes. All prices are in USD, and AwardLens is built around the reporting and compliance vocabulary used by US funders.",
  },
];

export default function PricingPage() {
  return (
    <>
      {/* ------------------------------------------------------------- head */}
      <section>
        <div className="container-page pb-10 pt-16 md:pb-12 md:pt-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Pricing
            </p>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.02em] text-balance sm:text-[2.75rem]">
              Priced for the size of the problem, not the size of the vendor
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-foreground-soft">
              The free tier analyses one award end to end — the full source-linked register,
              review and confirmation, and every export. Paid plans add more awards and email
              deadline reminders.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ plans */}
      <section>
        <div className="container-page pb-16 md:pb-20">
          <h2 className="sr-only">Plans</h2>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_LIST.map((plan) => {
              const isFree = plan.mode === "free";
              return (
                <Card key={plan.id} className="flex flex-col shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-[15px]">{plan.name}</CardTitle>
                      {isFree ? <Badge variant="primary">Start here</Badge> : null}
                    </div>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-semibold tracking-[-0.02em] tabular">
                        {plan.price}
                      </span>
                      {plan.cadence ? (
                        <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                      ) : null}
                    </p>
                    <CardDescription className="mt-1 leading-relaxed">
                      {plan.tagline}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1">
                    <p className="border-t border-border pt-4 font-mono text-xs text-ink-accent">
                      {awardLimitLabel(plan)}
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2.5 text-sm text-foreground-soft">
                          <Check
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-primary"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter>
                    <Button asChild variant={isFree ? "primary" : "secondary"} className="w-full">
                      <Link href="/app/awards/new">
                        {isFree ? "Analyse an award" : "Get started"}
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Every account starts on Free. Paid plans are chosen inside AwardLens once your
            organisation exists, so nothing is charged before you have seen a register built from
            one of your own awards.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ comparison */}
      <section className="border-y border-border bg-surface-sunken">
        <div className="container-page py-16 md:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              Plan comparison
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground-soft">
              Source-linked citations, human review and confirmation, and CSV, calendar and JSON
              export are on every plan, including the free one. What changes is how many awards
              you can analyse and whether AwardLens emails you before a deadline.
            </p>
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                AwardLens plans compared by purpose, awards included, email deadline reminders and
                billing.
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-56 px-5 py-4 align-bottom font-medium text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em]">Plan</span>
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <th key={plan.id} scope="col" className="px-5 py-4 align-bottom">
                      <span className="block text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                        {plan.name}
                      </span>
                      <span className="mt-1 block text-sm font-normal text-muted-foreground">
                        <span className="tabular font-medium text-foreground">{plan.price}</span>
                        {plan.cadence ? ` ${plan.cadence}` : ""}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 align-top font-medium">
                    What it is for
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="px-5 py-4 align-top text-muted-foreground">
                      {plan.tagline}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 align-top font-medium">
                    Awards included
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="px-5 py-4 align-top font-mono text-xs text-ink-accent">
                      {awardLimitLabel(plan)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 align-top font-medium">
                    Email deadline reminders
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="px-5 py-4 align-top">
                      <span
                        className={
                          plan.emailReminders
                            ? "inline-flex items-center gap-2 text-foreground-soft"
                            : "inline-flex items-center gap-2 text-muted-foreground"
                        }
                      >
                        {plan.emailReminders ? (
                          <Check aria-hidden="true" className="size-4 text-primary" />
                        ) : (
                          <Minus aria-hidden="true" className="size-4" />
                        )}
                        {plan.emailReminders ? "Included" : "Not included"}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 align-top font-medium">
                    Billing
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="px-5 py-4 align-top text-muted-foreground">
                      {billingLabel(plan)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Email reminders require a paid plan. On the free tier, export the deadline calendar
            and let your own calendar remind you.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------- assisted setup */}
      <section id="assisted-setup" className="scroll-mt-16">
        <div className="container-page py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Assisted setup
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
                Several live awards and no register at all?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-foreground-soft">
                That is the normal starting position, and it is the hardest week. Assisted setup
                is a working session rather than a sales call: we load your existing award
                documents with you, go through the extracted items together, and agree owners and
                dates before your team takes it over.
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
                <h3 className="text-lg font-semibold tracking-[-0.01em]">
                  Talk to us before you commit
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-foreground-soft">
                  Assisted setup is available with the {PLANS.team.name} plan, and as a paid pilot
                  for organisations that want help getting a first portfolio in place. Tell us how
                  many live awards you have, who the funders are, and when your next report is
                  due — that is usually enough for us to say whether AwardLens will help you or
                  not.
                </p>

                <ul className="mt-6 space-y-2.5 text-sm text-foreground-soft">
                  {[
                    "We load your existing award documents with you",
                    "We work through the extracted items together, in your vocabulary",
                    "You leave with owners, dates and a register your team can run",
                  ].map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild size="lg">
                    <a href="mailto:hello@awardlens.app?subject=Assisted%20setup%20enquiry">
                      <Mail aria-hidden="true" />
                      Email us about assisted setup
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="ghost">
                    <Link href="/demo">View a sample register</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ pricing faq */}
      <section className="border-t border-border">
        <div className="container-page py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
                Pricing questions
              </h2>
              <p className="mt-4 text-base leading-relaxed text-foreground-soft">
                Product questions are answered on the{" "}
                <Link href="/#faq" className="text-primary underline underline-offset-4">
                  home page FAQ
                </Link>
                .
              </p>
            </div>

            <div className="lg:col-span-8">
              <Accordion type="single" collapsible className="border-t border-border">
                {PRICING_FAQ.map((item) => (
                  <AccordionItem key={item.value} value={item.value}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent>{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- close cta */}
      <section>
        <div className="container-page py-14 md:py-16">
          <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-xl font-semibold tracking-[-0.01em]">
                One award, no payment, no obligation
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Analyse the award you are least sure about and judge AwardLens on the register it
                gives you back.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/app/awards/new">Analyse an award</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
