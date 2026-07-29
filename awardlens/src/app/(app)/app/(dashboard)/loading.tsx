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
 */
export default function Loading() {
  return (
    <div className="container-page pt-8">
      <span className="sr-only" role="status">
        Loading
      </span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-80" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      </div>
    </div>
  );
}
