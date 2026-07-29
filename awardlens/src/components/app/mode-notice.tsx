import { Info } from "lucide-react";

/**
 * Tells the operator, in the product, which graded modes are active.
 *
 * Silence here would be the dangerous option: a deployment running deterministic
 * extraction or development billing should say so on every screen rather than
 * look identical to a fully configured one.
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
    <div className="border-b border-warning-border bg-warning-subtle" data-print="hide">
      <p className="container-page flex items-start gap-2 py-2 text-xs text-warning">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Running in {notices.join(", ")}.</span>{" "}
          Everything works, but results and data durability differ from a fully configured
          deployment. See the build guide to connect a model, Stripe and a database.
        </span>
      </p>
    </div>
  );
}
