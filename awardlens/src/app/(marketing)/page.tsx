import type { Metadata } from "next";
import Link from "next/link";
import {
  Ban,
  Building2,
  CalendarDays,
  Check,
  CircleHelp,
  Download,
  FileSearch,
  KeyRound,
  ListChecks,
  Lock,
  Printer,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/navigation";
import { PLANS, type Plan } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: {
    absolute: "AwardLens — know what your grant agreement actually requires",
  },
  description:
    "Upload an award letter or grant agreement and get a source-linked register of deadlines, deliverables, restrictions and reporting requirements. Every item cites the page it came from, and you confirm every item yourself.",
};

/* ------------------------------------------------------------------ data -- */

const HERO_TRUST = [
  "Text-based PDF, DOCX or pasted text",
  "Your document stays private to your organisation",
  "Every item cites the page or section it came from",
];

const STEPS = [
  {
    number: "01",
    title: "Upload the award",
    body: "Add the award letter or grant agreement as a text-based PDF or DOCX, or paste the text straight in. AwardLens splits it into pages and sections it can point back to later.",
  },
  {
    number: "02",
    title: "Read it with source locations",
    body: "Each candidate obligation comes back with a category, a due date where the document states one, and the sentence it was drawn from — with the page or section that sentence sits on.",
  },
  {
    number: "03",
    title: "Review and confirm",
    body: "You work down the register. Confirm what is right, correct what is not, mark items that do not apply, and flag anything you want to put to the funder. Nothing counts as settled until you say so.",
  },
  {
    number: "04",
    title: "Operate the award",
    body: "Confirmed items become a deadline calendar, an assignable register, reminders before dates fall due, and a printable operating plan you can hand to a colleague or a board.",
  },
];

const OUTPUTS = [
  {
    icon: ListChecks,
    title: "Obligation register",
    body: "Every deadline, deliverable, restriction and reporting requirement in one table — grouped into deadlines, money, programme delivery and compliance, with a suggested owner, a priority and a review status on each row.",
  },
  {
    icon: CalendarDays,
    title: "Deadline calendar (.ics)",
    body: "An all-day event for each dated obligation, plus a date to start work on it. Recurring requirements are expanded into explicit dates rather than a repeat rule, so nothing quietly means something other than what the award said.",
  },
  {
    icon: Ban,
    title: "Restrictions and allowable uses",
    body: "What the award prohibits, what it restricts, what needs written approval before it happens, and any match or cost share you committed to — each next to the clause that created it.",
  },
  {
    icon: CircleHelp,
    title: "Open questions for the funder",
    body: "Where the document is silent, ambiguous, or disagrees with itself, AwardLens writes the question to put to your programme officer instead of choosing an answer on your behalf.",
  },
  {
    icon: Printer,
    title: "Printable operating plan",
    body: "One document for a board packet, a staff handover or a grant file, printed straight from the browser with the register and its citations intact.",
  },
  {
    icon: Download,
    title: "CSV and JSON export",
    body: "Your register in your own systems, with the page or section reference carried on every row so the citation survives the export.",
  },
];

const PERSONAS = [
  {
    role: "Executive director, small nonprofit",
    body: "Knows what the organisation has committed to, and what falls due next quarter, without re-reading a 40-page agreement.",
  },
  {
    role: "Grants or development manager",
    body: "Runs the register day to day — owners, dates, and reports started before they are late rather than after.",
  },
  {
    role: "Finance leader",
    body: "Sees restrictions, match and cost share, prior-approval thresholds and closeout requirements sitting next to the clause that creates them.",
  },
  {
    role: "Programme manager",
    body: "Gets the deliverables and performance measures that belong to their programme, in the funder's own words.",
  },
  {
    role: "Independent grant consultant",
    body: "Onboards a new client's award quickly and hands back a register the client can operate without you in the room.",
  },
];

const SECURITY = [
  {
    icon: Lock,
    title: "Private document storage",
    body: "Award documents are held in private storage and are never served from a public URL.",
  },
  {
    icon: Building2,
    title: "Scoped to your organisation",
    body: "Awards, documents and obligations belong to an organisation. Its members can see them. Nobody else can.",
  },
  {
    icon: Trash2,
    title: "Documents you can delete",
    body: "Remove a document and the items extracted from it when you no longer need to keep them.",
  },
  {
    icon: ShieldCheck,
    title: "No training on your documents",
    body: "Your award text is used to produce your register. It is not used to train models.",
  },
  {
    icon: KeyRound,
    title: "Secrets stay server-side",
    body: "Model, billing and email credentials are read on the server only and never reach the browser.",
  },
];

const FAQ = [
  {
    value: "scanned",
    question: "Can AwardLens read a scanned PDF?",
    answer:
      "Not yet. AwardLens reads the text layer of a document. If your PDF is a scan or a photo of a printed agreement there is no text to read, so the upload stops with an explanation instead of guessing at the contents. You can paste the text of the award instead, or upload the DOCX your funder originally sent.",
  },
  {
    value: "advice",
    question: "Is this legal or compliance advice?",
    answer:
      "No. AwardLens is a reading and organising tool. It shows you what your award document says and where it says it. It does not tell you whether you are compliant, it does not guarantee that every obligation has been found, and it is not a substitute for your attorney, your auditor or your programme officer. What an obligation means for your organisation stays your decision.",
  },
  {
    value: "document",
    question: "What happens to my document?",
    answer:
      "It is stored privately for your organisation and used to produce your register. We keep it so that you can open the source of any item later and read it in context. You can delete the document and its extracted items whenever you want, and your documents are not used to train models.",
  },
  {
    value: "accuracy",
    question: "How accurate is the extraction, and why do I have to review it?",
    answer:
      "Award documents are prose, written by people, and they hide requirements in sentences that do not look like requirements. AwardLens finds candidate obligations and labels each one with how much interpretation was involved — explicit in the award, interpreted, or uncertain — alongside the quotation it came from. Some items will be wrong and some will be missed, which is exactly why review is not optional: an item is not part of your register until a person has confirmed it against the document.",
  },
  {
    value: "file-types",
    question: "What file types work?",
    answer:
      "Text-based PDF, DOCX, plain text and Markdown files up to 15 MB, or text pasted directly into the app up to 400,000 characters. Scanned images, .doc files and spreadsheets are not supported.",
  },
  {
    value: "edit",
    question: "Can I edit obligations, or add ones AwardLens missed?",
    answer:
      "Yes. You can correct a title, a date, a category, a priority or an owner, and you can add obligations yourself — added items are marked as manual so it is always clear which items came from the document and which came from you. You can also mark an item not applicable or archive it rather than deleting it, so the reasoning stays on the record.",
  },
  {
    value: "contradictions",
    question: "What if the document contradicts itself?",
    answer:
      "It often does — an award letter says one date and the attached terms say another. AwardLens records the competing dates against the same obligation, each with its own source location, rather than silently picking one. The item is flagged for clarification and comes with a drafted question you can send to the funder.",
  },
  {
    value: "calendar",
    question: "Can I export to my own calendar?",
    answer:
      "Yes. AwardLens produces a standard .ics file that imports into Google Calendar, Outlook and Apple Calendar, with an all-day event for each dated obligation and a second event for the date you should start work. Confirmed items are included by default, because an unreviewed item does not belong in anyone's calendar. CSV and JSON exports are available too.",
  },
  {
    value: "amendments",
    question: "What happens when my award has an amendment?",
    answer:
      "Analyse the amendment as its own document. Its obligations arrive with citations pointing at the amendment, so it is clear which requirement came from which agreement. Where the amendment changes something you already confirmed, update or archive the original item so the register reflects the current agreement. AwardLens does not reconcile the two documents for you — that judgement is yours.",
  },
  {
    value: "who-sees",
    question: "Who in my organisation can see an award?",
    answer:
      "Everyone you have added to that organisation, and nobody outside it. Awards belong to the organisation rather than to the person who uploaded them, so a register does not disappear when a staff member leaves.",
  },
];

const PREVIEW_PLANS: Plan[] = [PLANS.demo, PLANS.single_award, PLANS.small_org];

function awardLimitLabel(plan: Plan): string {
  if (plan.awardLimit === null) return "Unmetered within fair use";
  return plan.awardLimit === 1 ? "One award analysis" : `Up to ${plan.awardLimit} awards`;
}

/* ------------------------------------------------------------------ page -- */

export default function MarketingHomePage() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section>
        <div className="container-page py-16 md:py-24 lg:py-28">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Post-award grant management
            </p>
            <h1 className="mt-5 font-serif text-[2.125rem] font-semibold leading-[1.1] tracking-[-0.02em] text-balance sm:text-5xl lg:text-[3.375rem]">
              Every grant comes with promises. AwardLens helps you keep them.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground-soft">
              Turn award letters and grant agreements into a source-linked register of
              deadlines, deliverables, restrictions and reporting requirements.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/app/awards/new">Analyse an award</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/demo">View a sample</Link>
              </Button>
            </div>

            <ul className="mt-10 flex flex-col gap-2.5 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-8">
              {HERO_TRUST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- product demonstration */}
      <section id="example" className="scroll-mt-16 border-y border-border bg-surface-sunken">
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              The unit of work
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              What one obligation looks like
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground-soft">
              AwardLens does not hand you a summary of your award. It takes the document apart
              one requirement at a time and keeps a line back to the sentence each requirement
              came from.
            </p>
          </div>

          <figure className="mt-10 md:mt-14">
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
              {/* the document ------------------------------------------- */}
              <div className="lg:col-span-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  The document
                </p>
                <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      Page 7 of 24
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      grant-agreement.pdf
                    </span>
                  </div>

                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
                    5. Reporting requirements
                  </p>

                  <div className="mt-3 space-y-3 font-serif text-[13.5px] leading-[1.7] text-foreground-soft">
                    <p>
                      <span className="mr-2 font-mono text-[11px] text-muted-foreground">5.1</span>
                      The Recipient shall maintain records sufficient to document the expenditure
                      of all Grant Funds.
                    </p>

                    <p className="rounded-r-sm border-l-2 border-primary bg-primary-subtle px-3 py-2.5 text-primary-subtle-foreground">
                      {/*
                        No opacity here. At 11px there is no contrast headroom:
                        opacity-70 blended --primary-subtle-foreground toward the
                        highlight background and measured 4.27:1, under the 4.5:1
                        that WCAG AA requires at this size. The token passes on
                        its own.
                      */}
                      <span className="mr-2 font-mono text-[11px]">5.2</span>
                      The Recipient shall submit quarterly narrative reports describing progress
                      toward the performance measures set out in Exhibit A.
                      <span className="mt-2 block font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                        Quoted in the register
                      </span>
                    </p>

                    <p>
                      <span className="mr-2 font-mono text-[11px] text-muted-foreground">5.3</span>
                      Reports are due within fifteen (15) days of the end of each calendar
                      quarter.
                    </p>
                  </div>
                </div>
              </div>

              {/* the register item -------------------------------------- */}
              <div className="lg:col-span-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  The register item
                </p>
                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                  <div className="px-5 pb-5 pt-5 sm:px-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="ink">Reporting</Badge>
                      <Badge variant="outline">Repeats quarterly</Badge>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        Item 04 / 23
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-semibold tracking-[-0.015em] sm:text-xl">
                      Quarterly narrative report
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Submit a narrative report describing progress against the performance
                      measures listed in Exhibit A, within 15 days of each quarter end.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span className="inline-flex items-center gap-2 font-mono font-medium text-ink-accent">
                        <CalendarDays aria-hidden="true" className="size-4" />
                        Due 15 October 2026
                      </span>
                      <span className="text-muted-foreground">
                        Suggested owner: Programme manager
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-y border-border bg-background px-5 py-3 sm:px-6">
                    <Badge variant="neutral">High confidence</Badge>
                    <Badge variant="warning">Needs review</Badge>
                    <Badge variant="primary">Explicit in award</Badge>
                  </div>

                  <div className="px-5 py-5 sm:px-6">
                    <div className="border-l-2 border-ink-accent/30 pl-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="font-mono text-xs font-medium text-ink-accent">
                          Source: Page 7
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          Section 5.2
                        </span>
                        <Badge variant="ink" className="ml-auto">
                          <ShieldCheck aria-hidden="true" className="size-3.5" />
                          Source verified
                        </Badge>
                      </div>
                      <blockquote className="evidence-quote mt-3">
                        &ldquo;The Recipient shall submit quarterly narrative reports describing
                        progress toward the performance measures set out in Exhibit A.&rdquo;
                      </blockquote>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4 sm:px-6">
                    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong px-3.5 text-sm font-medium text-muted-foreground">
                      <FileSearch aria-hidden="true" className="size-4" />
                      Open source
                    </span>
                    <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary-subtle px-3.5 text-sm font-medium text-primary-subtle-foreground">
                      <Check aria-hidden="true" className="size-4" />
                      Confirm
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Static example
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <figcaption className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              A single item from a sample register. Every item carries the same four things: what
              is required, when it is due, how much interpretation was involved, and the words it
              came from.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* -------------------------------------------------------- workflow */}
      <section id="how-it-works" className="scroll-mt-16">
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              How it works
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              From award document to operating plan
            </h2>
          </div>

          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.number} className="border-t border-border-strong pt-5">
                <span className="font-mono text-xs font-medium tracking-[0.08em] text-primary">
                  {step.number}
                </span>
                <h3 className="mt-3 text-base font-semibold tracking-[-0.01em]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------------------- outputs */}
      <section id="outputs" className="scroll-mt-16">
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              What you get
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              Six things you can take away from one award
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground-soft">
              All of it built from items you have reviewed, and all of it exportable — AwardLens
              is somewhere to do the work, not somewhere your work gets locked in.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {OUTPUTS.map((output) => (
              <Card key={output.title} className="shadow-sm">
                <CardHeader>
                  <span className="mb-2 inline-flex size-9 items-center justify-center rounded-md bg-primary-subtle text-primary">
                    <output.icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <CardTitle>{output.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{output.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ source-linked trust */}
      <section id="evidence" className="scroll-mt-16 border-y border-border bg-surface-sunken">
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Why you can act on it
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              Two rules the product does not bend
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground-soft">
              Source linking and human confirmation are not settings you switch on. They are how
              the register is built, and they are the reason a register is worth trusting to a
              board or a funder conversation.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
              <span className="font-mono text-xs font-medium text-muted-foreground">Rule one</span>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">
                Every material item is traced to a page or section
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground-soft">
                Each obligation carries the quotation it was drawn from and the location of that
                quotation in your document — a page, a section, or a paragraph. You can open the
                source and read the surrounding text before you decide anything. A register you
                cannot check against the agreement is just another opinion about the agreement.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
              <span className="font-mono text-xs font-medium text-muted-foreground">Rule two</span>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em]">
                Nothing is confirmed until a person confirms it
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground-soft">
                Items arrive as <span className="font-medium text-foreground">Needs review</span>.
                You decide whether each becomes confirmed, needs clarification from the funder, or
                does not apply to your organisation. Every item also states how much
                interpretation was involved, so &ldquo;the award says this&rdquo; is never
                confused with &ldquo;we inferred this&rdquo;. Calendar exports carry confirmed
                items by default.
              </p>
            </div>
          </div>

          <Alert variant="warning" className="mt-6 flex gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5" />
            <div>
              <AlertTitle>When a source cannot be verified</AlertTitle>
              <AlertDescription>
                <p>
                  AwardLens checks each quotation back against the stored text of your document.
                  If a quotation cannot be matched, the item is labelled{" "}
                  <span className="font-medium">source confirmation needed</span> and stays in the
                  register where you can see it. Hiding an item we are unsure about would be the
                  more comfortable choice and the wrong one.
                </p>
              </AlertDescription>
            </div>
          </Alert>
        </div>
      </section>

      {/* -------------------------------------------------------- personas */}
      <section>
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Who it is for
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              Built for the people who have to answer for the award
            </h2>
          </div>

          <dl className="mt-10 max-w-4xl">
            {PERSONAS.map((persona) => (
              <div
                key={persona.role}
                className="grid gap-1.5 border-t border-border py-5 md:grid-cols-[15rem_1fr] md:gap-10"
              >
                <dt className="text-[15px] font-medium tracking-[-0.01em]">{persona.role}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{persona.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------- security */}
      <section id="privacy" className="scroll-mt-16">
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Security and privacy
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              Your award documents are yours
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground-soft">
              A grant agreement often contains budget detail, staff names and information about
              the people you serve. It is treated accordingly.
            </p>
          </div>

          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-accent-subtle text-ink-accent">
                  <item.icon aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h3 className="text-[15px] font-medium tracking-[-0.01em]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 max-w-2xl rounded-lg border border-border bg-surface-sunken p-5">
            <h3 className="text-sm font-semibold">What we do not claim</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              AwardLens holds no SOC 2, ISO, HIPAA or FedRAMP certification, and we will not imply
              otherwise on a marketing page. If your funder or your board requires a certified
              vendor, AwardLens is not that vendor today.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- pricing preview */}
      <section className="border-y border-border bg-surface-sunken">
        <div className="container-page py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Pricing
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
              Start with one award, at no cost
            </h2>
            <p className="mt-4 text-base leading-relaxed text-foreground-soft">
              The free tier analyses one award end to end, with the full register, source
              citations and exports. Paid plans add more awards and email deadline reminders.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PREVIEW_PLANS.map((plan) => (
              <Card key={plan.id} className="flex flex-col shadow-sm">
                <CardHeader>
                  <CardTitle className="text-[15px]">{plan.name}</CardTitle>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tracking-[-0.02em] tabular">
                      {plan.price}
                    </span>
                    {plan.cadence ? (
                      <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                    ) : null}
                  </p>
                  <CardDescription className="mt-1">{plan.tagline}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="border-t border-border pt-4 font-mono text-xs text-ink-accent">
                    {awardLimitLabel(plan)}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm text-foreground-soft">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {PLANS.team.name} is {PLANS.team.price} {PLANS.team.cadence}.{" "}
              {PLANS.team.tagline}
            </p>
            <Button asChild variant="secondary">
              <Link href="/pricing">Compare every plan</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- faq */}
      <section id="faq" className="scroll-mt-16">
        <div className="container-page py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Questions
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-tight">
                Straight answers, including the unflattering ones
              </h2>
              <p className="mt-4 text-base leading-relaxed text-foreground-soft">
                Where AwardLens has a limit, it is written down here rather than discovered later.
              </p>
            </div>

            <div className="lg:col-span-8">
              <Accordion type="single" collapsible className="border-t border-border">
                {FAQ.map((item) => (
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

      {/* ------------------------------------------------------ closing cta */}
      <section className="bg-ink-accent">
        <div className="container-page py-16 md:py-20">
          <div className="max-w-2xl">
            <h2 className="font-serif text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-4xl">
              Start with the award that worries you most.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/75">
              Upload it, read the register against the document, confirm what is right, and see
              whether the next twelve months look clearer than they did this morning. The first
              award analysis is free.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="bg-surface text-ink-accent hover:bg-muted focus-visible:outline-white"
              >
                <Link href="/app/awards/new">Analyse an award</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="border border-white/25 text-white hover:bg-white/10 hover:text-white focus-visible:outline-white"
              >
                <Link href="/demo">View a sample first</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
