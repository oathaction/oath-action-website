import { Skeleton } from "@/components/ui/misc";

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
