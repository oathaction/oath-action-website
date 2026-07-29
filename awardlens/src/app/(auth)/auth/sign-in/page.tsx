import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AwardLens with a one-time code sent to your email.",
};

/**
 * What the product actually promises, said once, beside the form.
 *
 * The sign-in screen used to be a card floating in the middle of an empty
 * page — the least considered surface in the product and, for anyone arriving
 * from an emailed link, the first one they see. A left rail gives it a subject:
 * the same three claims the marketing site makes, stated plainly, including the
 * one about nothing being confirmed until a person confirms it. No invented
 * customers, no logos, no numbers.
 */
const PROMISES = [
  "Every extracted item shows the exact sentence in your document that it came from.",
  "You confirm or correct each one. Nothing is treated as confirmed until a person confirms it.",
  "Export to calendar, CSV or JSON, and print an operating plan you can hand to a board.",
] as const;

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <aside className="hidden border-r border-border bg-surface-sunken px-12 py-10 lg:flex lg:flex-col xl:px-16">
        <Link
          href="/"
          aria-label="AwardLens — home"
          className="flex w-fit items-center gap-2.5 rounded-sm text-foreground"
        >
          <AwardLensMark />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">AwardLens</span>
        </Link>

        <div className="my-auto max-w-md py-16">
          <p className="eyebrow text-primary">Source-linked by default</p>
          <p className="type-heading mt-3 text-foreground">
            A grant agreement, read closely and written down.
          </p>
          <ul className="mt-8 border-t border-border">
            {PROMISES.map((promise) => (
              <li
                key={promise}
                className="border-b border-border py-4 text-sm leading-relaxed text-foreground-soft"
              >
                {promise}
              </li>
            ))}
          </ul>
        </div>

        <p className="type-caption text-muted-foreground">
          AwardLens organises what your award documents say. It is not legal, accounting, tax or
          compliance advice.
        </p>
      </aside>

      <main id="main" className="flex min-h-dvh flex-col px-5 py-8 sm:px-8 lg:min-h-0 lg:py-10">
        <Link
          href="/"
          aria-label="AwardLens — home"
          className="flex w-fit items-center gap-2.5 rounded-sm text-foreground lg:hidden"
        >
          <AwardLensMark />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">AwardLens</span>
        </Link>

        <div className="mx-auto flex w-full max-w-[27rem] flex-1 flex-col justify-center py-10 lg:py-0">
          <h1 className="type-heading">Sign in</h1>
          <p className="type-small mt-2 text-muted-foreground">
            We&rsquo;ll email you a six-digit code. No password to remember.
          </p>

          <Card elevation="raised" className="mt-6">
            <CardContent padding="roomy" className="pt-7">
              <SignInForm />
            </CardContent>
          </Card>

          <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
            By signing in you agree that AwardLens is a workflow tool and does not provide legal,
            accounting, tax or compliance advice. Always check requirements against your award
            document.
          </p>
        </div>
      </main>
    </div>
  );
}

/** The aperture mark — the same drawing the marketing and app headers use. */
function AwardLensMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-7 text-primary">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <g stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" opacity="0.62">
        <path d="M12 7.5 15.9 9.75 15.9 14.25 12 16.5 8.1 14.25 8.1 9.75Z" />
        <path d="M12 7.5V3" strokeLinecap="round" />
        <path d="M8.1 14.25 4.21 16.5" strokeLinecap="round" />
        <path d="M15.9 14.25 19.79 16.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
