import { Skeleton } from "@/components/ui/misc";

/**
 * Dashboard skeleton.
 *
 * This lives inside the `(dashboard)` route group rather than at the `/app`
 * segment root on purpose. A `loading.tsx` at the segment root puts a Suspense
 * boundary above every nested route, so Next streams the response and flushes
 * a 200 status line before the page component runs. Any award route that then
 * calls `notFound()` can no longer change the status, and a missing or
 * non-permitted award returns 200 with the not-found UI appended.
 *
 * The route group keeps this skeleton scoped to the dashboard — which never
 * calls `notFound()` — so the award routes below can still return a real 404.
 *
 * The shapes mirror the real dashboard: title, meta line, the four-cell stat
 * strip and the 1.6fr/1fr split below it. A skeleton whose blocks land
 * somewhere other than the content that replaces them reads as the page
 * jumping, which is worse than showing nothing.
 */
export default function Loading() {
  return (
    <div className="container-page pt-8">
      <span className="sr-only" role="status">
        Loading
      </span>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2.5 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[5.75rem] rounded-lg" />
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Skeleton className="h-4 w-32" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[4.25rem] rounded-lg" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-4 w-28" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
