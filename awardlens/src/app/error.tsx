"use client";

import { useEffect } from "react";
import { RotateCw, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button, ButtonRow } from "@/components/ui/button";

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
    <main
      id="main"
      className="container-page flex min-h-dvh flex-col items-center justify-center py-16"
    >
      <div className="w-full max-w-lg text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-xl border border-warning-border bg-warning-subtle text-warning shadow-resting [&>svg]:size-5"
        >
          <TriangleAlert />
        </span>

        <h1 className="type-title mt-6 text-foreground">Something went wrong</h1>
        <p className="type-lede mt-3 text-muted-foreground">The page failed to load.</p>

        {/*
         * The reassurance is the reason this page exists, so it gets a surface
         * of its own rather than being the tail of a grey paragraph.
         */}
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left shadow-resting">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="type-small text-foreground-soft">
            Your documents and your review work are unaffected — nothing is lost by trying again.
          </p>
        </div>

        <ButtonRow className="mt-7 justify-center">
          <Button onClick={reset}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign("/app")}>
            Go to dashboard
          </Button>
        </ButtonRow>

        {/*
         * A footnote rather than a panel: the digest matters to the one person
         * in a hundred who reports this, and it should not outrank the button
         * that fixes it for the other ninety-nine.
         */}
        {error.digest ? (
          <p className="rule type-caption mt-9 break-words pt-4 text-muted-foreground">
            Reference <span className="font-mono text-foreground-soft">{error.digest}</span> — this
            code identifies the failure in our logs and contains nothing from your documents.
          </p>
        ) : null}
      </div>
    </main>
  );
}
