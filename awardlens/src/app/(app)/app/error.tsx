"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    <div className="container-page pt-10">
      <div className="mx-auto max-w-lg">
        <Alert variant="destructive">
          <AlertTitle>This page didn&rsquo;t load</AlertTitle>
          <AlertDescription>
            <p>
              Something failed while loading your award data. Nothing has been changed or deleted.
            </p>
            {error.digest ? (
              <p className="mt-2 font-mono text-xs">Reference: {error.digest}</p>
            ) : null}
          </AlertDescription>
        </Alert>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="secondary">
            <Link href="/app">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
