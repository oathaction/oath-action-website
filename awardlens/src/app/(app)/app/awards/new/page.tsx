import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db/local";
import { checkAwardEntitlement } from "@/lib/billing/plans";
import { UploadFlow } from "@/components/documents/upload-flow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Analyse an award" };

export default async function NewAwardPage() {
  const session = await requireSession();
  const [subscription, awards] = await Promise.all([
    db.getSubscription(session.organization.id),
    db.listAwards(session.organization.id),
  ]);
  const entitlement = checkAwardEntitlement(subscription, awards.length);

  return (
    <div className="container-page pt-6">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Dashboard
      </Link>

      <div className="mx-auto mt-6 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Analyse an award</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Upload the grant agreement, award letter or notice of award. AwardLens reads it and
          builds a register of what your organisation has committed to — with a source citation
          for every item.
        </p>

        {!entitlement.allowed ? (
          <Alert variant="warning" className="mt-6">
            <AlertTitle>Plan limit reached</AlertTitle>
            <AlertDescription>
              <p>{entitlement.reason}</p>
              <Button asChild size="sm" variant="secondary" className="mt-3">
                <Link href="/app/settings#billing">View plans</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <UploadFlow />
        )}

        <div className="mt-8 rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="size-4 text-primary" aria-hidden="true" />
            Your document stays private
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground-soft">
            <li>
              It is stored in private storage that is not publicly reachable, and is only
              accessible to members of {session.organization.name}.
            </li>
            <li>It is used to analyse this award. It is not used to train any model.</li>
            <li>You can delete the document, and everything extracted from it, at any time.</li>
            <li>
              Extracted text is sent to the configured AI provider for analysis. If no model is
              configured, AwardLens uses a built-in deterministic extractor and makes no external
              calls at all.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
