"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button, ButtonRow } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error", { digest: error.digest });
  }, [error]);

  return (
    <div className="container-page py-16 sm:py-24">
      <div className="mx-auto w-full max-w-lg text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-xl border border-warning-border bg-warning-subtle text-warning shadow-resting [&>svg]:size-5"
        >
          <TriangleAlert />
        </span>

        <h1 className="type-title mt-6 text-foreground">This page didn&rsquo;t load</h1>
        <p className="type-lede mt-3 text-muted-foreground">
          Something failed while loading your award data.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left shadow-resting">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="type-small text-foreground-soft">
            Nothing has been changed or deleted. Your award, your documents and every decision you
            have already recorded are exactly as you left them.
          </p>
        </div>

        <ButtonRow className="mt-7 justify-center">
          <Button onClick={reset}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">Back to dashboard</Link>
          </Button>
        </ButtonRow>

        {/* A footnote, not a panel — see the note in `src/app/error.tsx`. */}
        {error.digest ? (
          <p className="rule type-caption mt-9 break-words pt-4 text-muted-foreground">
            Reference <span className="font-mono text-foreground-soft">{error.digest}</span> — this
            code identifies the failure in our logs and contains nothing from your documents.
          </p>
        ) : null}
      </div>
    </div>
  );
}
