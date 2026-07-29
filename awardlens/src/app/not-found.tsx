import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">We couldn&rsquo;t find that</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        The page may have moved, or the award may have been deleted. If you followed a link from
        outside AwardLens, it may point to something that belongs to a different organisation.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/app">Go to your dashboard</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Back to the home page</Link>
        </Button>
      </div>
    </main>
  );
}
