import Link from "next/link";
import { ChevronDown } from "lucide-react";

/**
 * Tells the operator, in the product, which graded modes are active.
 *
 * Silence here would be the dangerous option: a deployment running deterministic
 * extraction or development billing should say so on every screen rather than
 * look identical to a fully configured one.
 *
 * But it says so on *every screen*, which is the whole design problem. As a
 * saturated amber bar it spent a fifth of a 390px phone before the page heading
 * had been reached, and it painted configuration the same colour the product
 * uses for a deadline that has passed. Amber is a budget: something that is
 * true on all 16 surfaces, all of the time, and needs no decision from anyone
 * cannot also be the loudest thing on the page.
 *
 * So the standing line is one sentence of quiet ink on `--warning-quiet` — the
 * token that exists for exactly this — with a single amber marker carrying the
 * colour, and the consequences folded into a native disclosure. Nothing was
 * removed: the modes are still named in full, in the first thing you read, and
 * the explanation is one keystroke away and reachable without a mouse.
 */
export function ModeNotice({
  aiMode,
  billingMode,
  storageMode,
}: {
  aiMode: string;
  billingMode: string;
  storageMode: string;
}) {
  const notices: string[] = [];
  if (aiMode === "fixtures") {
    notices.push("deterministic extraction (no AI model configured)");
  }
  if (billingMode === "development") notices.push("development billing");
  if (storageMode === "local") notices.push("local storage");

  if (notices.length === 0) return null;

  return (
    <div className="border-b border-warning-border bg-warning-quiet" data-print="hide">
      <details className="group container-page py-1.5">
        <summary className="flex cursor-pointer list-none items-start gap-2 rounded-sm text-xs leading-relaxed text-foreground-soft marker:content-none [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="mt-[7px] size-[5px] shrink-0 rounded-full bg-warning"
          />
          <span className="min-w-0">
            {/* 5.69:1 — --warning on --warning-quiet */}
            <span className="font-medium text-warning">Running in {notices.join(", ")}.</span>{" "}
            {/* 5.64:1 — --muted-foreground on --warning-quiet */}
            <span className="whitespace-nowrap font-medium text-muted-foreground group-open:hidden">
              What this affects
              <ChevronDown
                aria-hidden="true"
                className="mb-px ml-0.5 inline-block size-3 align-middle"
              />
            </span>
            <span className="hidden whitespace-nowrap font-medium text-muted-foreground group-open:inline">
              Hide
              <ChevronDown
                aria-hidden="true"
                className="mb-px ml-0.5 inline-block size-3 rotate-180 align-middle"
              />
            </span>
          </span>
        </summary>

        <p className="measure-wide mt-1.5 pl-[13px] text-xs leading-relaxed text-muted-foreground">
          Everything works, but results and data durability differ from a fully configured
          deployment. See the build guide to connect a model, Stripe and a database, or{" "}
          <Link
            href="/app/settings#system-status"
            className="font-medium text-primary underline decoration-primary/35 underline-offset-2 hover:decoration-primary"
          >
            check what this deployment has configured
          </Link>
          .
        </p>
      </details>
    </div>
  );
}
