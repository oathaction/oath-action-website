import Link from "next/link";
import { FileSearch, Lock } from "lucide-react";

import { Button, ButtonRow } from "@/components/ui/button";
import { AwardLensMark } from "@/components/marketing/site-header";

export default function NotFound() {
  return (
    /*
     * This file is the root not-found, so it renders outside both the app shell
     * and the marketing shell: no header, no footer, nothing. A bare page
     * carrying a warning glyph and no product name is exactly what a broken
     * host or a bad redirect looks like, which is the last impression this
     * product can afford at the moment someone's bookmarked award link fails.
     * The lockup gives the page a horizon and says whose software you are still
     * inside; the message then centres in what is left.
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
            className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-foreground-soft shadow-resting [&>svg]:size-5"
          >
            <FileSearch />
          </span>

          <p className="mt-6 font-mono text-[13px] tracking-[0.12em] text-muted-foreground">404</p>
          <h1 className="type-title mt-2.5 text-balance text-foreground">
            We couldn&rsquo;t find that
          </h1>
          <p className="type-lede mt-3 text-balance text-muted-foreground">
            The page may have moved, or the award may have been deleted.
          </p>

          {/*
           * Kept as a note of its own rather than a trailing clause: on this
           * page it is usually the real explanation, and it is also the product
           * saying out loud that one organisation cannot open another's award.
           *
           * A hairline and a surface, but no shadow. Raised, it read as a card
           * that had lost its heading and it out-weighed the primary button
           * directly beneath it; flat, it settles into the column as the inset
           * note it is.
           */}
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 text-left">
            <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="type-small text-foreground-soft">
              If you followed a link from outside AwardLens, it may point to something that belongs
              to a different organisation. Awards are never readable across organisations.
            </p>
          </div>

          <ButtonRow className="mt-7 flex-col justify-center sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/app">Go to your dashboard</Link>
            </Button>
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/">Back to the home page</Link>
            </Button>
          </ButtonRow>
        </div>
      </div>
    </main>
  );
}
