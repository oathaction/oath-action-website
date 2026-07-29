"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button, ButtonRow } from "@/components/ui/button";
import { AwardLensMark } from "@/components/marketing/site-header";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only safe correlator — the message may contain
    // information drawn from a private award document.
    console.error("[app] unhandled error", { digest: error.digest });
  }, [error]);

  return (
    /*
     * This boundary sits above both shells, so it renders with no header and no
     * footer. Unbranded, a warning triangle over an apology is indistinguishable
     * from a hosting failure; the lockup is what says the product is still
     * there and only this page fell over.
     */
    <main id="main" className="container-page flex min-h-dvh flex-col py-7">
      <Link
        href="/"
        className="inline-flex shrink-0 items-center gap-2 self-start rounded-sm text-foreground"
      >
        <AwardLensMark className="size-6 text-primary" />
        <span className="text-[15px] font-semibold tracking-[-0.02em]">AwardLens</span>
      </Link>

      <div className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-lg text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-12 items-center justify-center rounded-xl border border-warning-border bg-warning-subtle text-warning shadow-resting [&>svg]:size-5"
          >
            <TriangleAlert />
          </span>

          <h1 className="type-title mt-6 text-balance text-foreground">Something went wrong</h1>
          <p className="type-lede mt-3 text-balance text-muted-foreground">
            The page failed to load.
          </p>

          {/*
           * The reassurance is the reason this page exists, so it gets a surface
           * of its own rather than being the tail of a grey paragraph — but a
           * flat one. With `shadow-resting` it read as a card that had lost its
           * heading, and it competed with the primary button sitting under it.
           */}
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="type-small text-foreground-soft">
              Your documents and your review work are unaffected — nothing is lost by trying again.
            </p>
          </div>

          <ButtonRow className="mt-7 flex-col justify-center sm:flex-row">
            <Button onClick={reset} className="w-full sm:w-auto">
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => window.location.assign("/app")}
            >
              Go to dashboard
            </Button>
          </ButtonRow>

          {/*
           * A footnote rather than a panel: the digest matters to the one person
           * in a hundred who reports this, and it should not outrank the button
           * that fixes it for the other ninety-nine. Held to a narrower measure
           * than the column so the rule above it stops reading as a section
           * divider and starts reading as what it is — the end of the page.
           */}
          {error.digest ? (
            <p className="rule type-caption mx-auto mt-9 max-w-sm text-balance break-words pt-4 text-muted-foreground">
              Reference <span className="font-mono text-foreground-soft">{error.digest}</span> —
              this code identifies the failure in our logs and contains nothing from your documents.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
