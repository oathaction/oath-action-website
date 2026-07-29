"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

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
      className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        The page failed to load. Your documents and your review work are unaffected — nothing is
        lost by trying again.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => window.location.assign("/app")}>
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}
