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

const FREE_PLAN: Plan = PLANS.demo;
const PAID_PLANS: Plan[] = PLAN_ORDER.filter((id) => id !== FREE_PLAN.id).map((id) => PLANS[id]);
const PLAN_LIST: Plan[] = PLAN_ORDER.map((id) => PLANS[id]);

function awardLimitLabel(plan: Plan): string {
  if (plan.awardLimit === null) return "Unmetered within fair use";
  return plan.awardLimit === 1 ? "One award analysis" : `Up to ${plan.awardLimit} awards`;
}

/**
 * The allowance is already stated once, in its own line under the price. Where
 * a plan's feature list opens by repeating it — "Up to 12 awards" — the
 * duplicate is dropped, which is one fewer wrapped line in every column.
 */
function planFeatures(plan: Plan): string[] {
  const limit = awardLimitLabel(plan);
  return plan.features.filter((feature) => feature !== limit);
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

/**
 * Pricing.
 *
 * Four equal columns at this width gave every plan about 280px, which wrapped
 * the plan names and ran every feature onto two lines — the page asked the
 * reader to do the comparing. So the recommendation is made in the layout
 * instead: Free gets a full-width panel because it is where the copy already
 * tells people to start, and the three paid plans share a roomier three-up row
 * beneath it. No popularity is claimed, because none is known.
 */
export default function PricingPage() {
  return (
    <>
      {/* ------------------------------------------------------ head + plans */}
      <section>
        <div className="container-page section-loose">
          <div className="max-w-4xl">
            <p className="eyebrow text-primary">Pricing</p>
            <h1 className="type-display mt-5">
              Priced for the size of the problem, not the size of the vendor
            </h1>
            <p className="type-lede measure-wide mt-6 text-foreground-soft">
              The free tier analyses one award end to end — the full source-linked register,
              review and confirmation, and every export. Paid plans add more awards and email
              deadline reminders.
            </p>
          </div>

          <h2 className="sr-only">Plans</h2>

          {/* ------------------------------------------------- the free plan */}
          <Card tone="primary" elevation="raised" className="mt-12 overflow-hidden md:mt-16">
            <div className="grid gap-y-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,21rem)_1fr] lg:gap-x-14 lg:p-10">
              <div>
                <div className="cluster">
                  <h3 className="type-heading">{FREE_PLAN.name}</h3>
                  <Badge
                    variant="primary"
                    className="border-transparent bg-primary text-primary-foreground"
                  >
                    Start here
                  </Badge>
                </div>

                <p className="metric tabular mt-5 text-[3.5rem] text-foreground">
                  {FREE_PLAN.price}
                </p>
                <p className="type-caption mt-3 font-mono text-primary-subtle-foreground">
                  {awardLimitLabel(FREE_PLAN)} · {billingLabel(FREE_PLAN)}
                </p>
                <p className="type-body mt-4 text-foreground-soft">{FREE_PLAN.tagline}</p>

                <Button asChild size="lg" className="mt-7 w-full sm:w-auto lg:w-full">
                  <Link href="/app/awards/new">Analyse an award</Link>
                </Button>
              </div>

              <ul className="grid content-start gap-x-10 gap-y-3.5 sm:grid-cols-2 lg:border-l lg:border-primary-border lg:pl-14">
                {planFeatures(FREE_PLAN).map((feature) => (
                  <li key={feature} className="type-body flex gap-2.5 text-foreground-soft">
                    <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* ------------------------------------------------ the paid plans */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PAID_PLANS.map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader padding="roomy">
                  <CardTitle>{plan.name}</CardTitle>
                  <p className="mt-2 flex items-baseline gap-1.5">
                    <span className="metric tabular text-[2.5rem]">{plan.price}</span>
                    {plan.cadence ? (
                      <span className="type-small text-muted-foreground">{plan.cadence}</span>
                    ) : null}
                  </p>
                  <p className="type-caption mt-1 font-mono text-ink-accent">
                    {awardLimitLabel(plan)}
                  </p>
                  <CardDescription className="mt-2">{plan.tagline}</CardDescription>
                </CardHeader>

                <CardContent padding="roomy" className="flex-1">
                  <ul className="stack-sm border-t border-border-subtle pt-5">
                    {planFeatures(plan).map((feature) => (
                      <li key={feature} className="type-small flex gap-2.5 text-foreground-soft">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter padding="roomy" className="pt-6">
                  <Button asChild variant="secondary" className="w-full">
                    <Link href="/app/awards/new">Get started</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>

          <p className="type-small measure-wide mt-8 text-muted-foreground">
            Every account starts on Free. Paid plans are chosen inside AwardLens once your
            organisation exists, so nothing is charged before you have seen a register built from
            one of your own awards.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- comparison */}
      <section className="border-y border-border bg-surface-sunken">
        <div className="container-page section-tight">
          <div className="measure-wide">
            <h2 className="type-heading">Plan comparison</h2>
            <p className="type-small mt-3 text-muted-foreground">
              Source-linked citations, human review and confirmation, and CSV, calendar and JSON
              export are on every plan, including the free one. What changes is how many awards
              you can analyse and whether AwardLens emails you before a deadline.
            </p>
          </div>

          <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-surface shadow-resting">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <caption className="sr-only">
                AwardLens plans compared by purpose, awards included, email deadline reminders and
                billing.
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="w-52 px-5 py-4 align-bottom font-normal text-muted-foreground"
                  >
                    <span className="eyebrow">Plan</span>
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <th key={plan.id} scope="col" className="px-5 py-4 align-bottom">
                      <span className="type-subhead block text-foreground">{plan.name}</span>
                      <span className="type-small mt-1 block font-normal text-muted-foreground">
                        <span className="tabular font-semibold text-foreground">{plan.price}</span>
                        {plan.cadence ? ` ${plan.cadence}` : ""}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="type-small">
                <tr className="border-b border-border-subtle">
                  <th scope="row" className="px-5 py-4 align-top font-medium">
                    What it is for
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="px-5 py-4 align-top text-muted-foreground">
                      {plan.tagline}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border-subtle">
                  <th scope="row" className="px-5 py-4 align-top font-medium">
                    Awards included
                  </th>
                  {PLAN_LIST.map((plan) => (
                    <td
                      key={plan.id}
                      className="type-caption px-5 py-4 align-top font-mono text-ink-accent"
                    >
                      {awardLimitLabel(plan)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border-subtle">
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

          <p className="type-small mt-4 text-muted-foreground">
            Email reminders require a paid plan. On the free tier, export the deadline calendar
            and let your own calendar remind you.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------- assisted setup */}
      <section id="assisted-setup" className="scroll-mt-16">
        <div className="container-page section">
          <div className="grid gap-x-16 gap-y-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="eyebrow text-muted-foreground">Assisted setup</p>
              <h2 className="type-heading mt-3">Several live awards and no register at all?</h2>
              <p className="type-body mt-4 text-foreground-soft">
                That is the normal starting position, and it is the hardest week. Assisted setup
                is a working session rather than a sales call: we load your existing award
                documents with you, go through the extracted items together, and agree owners and
                dates before your team takes it over.
              </p>
            </div>

            <div className="lg:col-span-7">
              <Card className="card-pad-roomy sm:p-9">
                <h3 className="type-subhead">Talk to us before you commit</h3>
                <p className="type-body mt-3 text-foreground-soft">
                  Assisted setup is available with the {PLANS.team.name} plan, and as a paid pilot
                  for organisations that want help getting a first portfolio in place. Tell us how
                  many live awards you have, who the funders are, and when your next report is
                  due — that is usually enough for us to say whether AwardLens will help you or
                  not.
                </p>

                <ul className="stack-sm mt-6 border-t border-border-subtle pt-5">
                  {[
                    "We load your existing award documents with you",
                    "We work through the extracted items together, in your vocabulary",
                    "You leave with owners, dates and a register your team can run",
                  ].map((item) => (
                    <li key={item} className="type-small flex gap-2.5 text-foreground-soft">
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
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ pricing faq */}
      <section className="border-t border-border">
        <div className="container-page section-tight">
          <div className="grid gap-x-16 gap-y-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="type-heading">Pricing questions</h2>
              <p className="type-small mt-3 text-muted-foreground">
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
      <section className="bg-ink-accent">
        <div className="container-page section">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between md:gap-12">
            <div className="max-w-2xl">
              <h2 className="type-title text-white">One award, no payment, no obligation</h2>
              <p className="type-lede mt-4 text-white/80">
                Analyse the award you are least sure about and judge AwardLens on the register it
                gives you back.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="shrink-0 bg-surface text-ink-accent hover:bg-muted focus-visible:outline-white"
            >
              <Link href="/app/awards/new">Analyse an award</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
