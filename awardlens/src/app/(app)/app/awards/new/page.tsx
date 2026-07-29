import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, TriangleAlert } from "lucide-react";

import { requireSession } from "@/lib/auth";
import * as db from "@/lib/db";
import { checkAwardEntitlement } from "@/lib/billing/plans";
import { UploadFlow } from "@/components/documents/upload-flow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Analyse an award" };

export default async function NewAwardPage() {
  const session = await requireSession();
  const [subscription, awards] = await Promise.all([
    db.getSubscription(session.organization.id),
    db.listAwards(session.organization.id),
  ]);
  const entitlement = checkAwardEntitlement(subscription, awards.length);

  return (
    <div className="container-page pt-6 sm:pt-8">
      <Link
        href="/app"
        className="type-small inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Dashboard
      </Link>

      <div className="mx-auto mt-6 max-w-5xl">
        <header className="max-w-2xl">
          <h1 className="type-title text-foreground">Analyse an award</h1>
          <p className="type-lede mt-3 text-muted-foreground">
            Upload the grant agreement, award letter or notice of award. AwardLens reads it and
            builds a register of what your organisation has committed to — with a source citation
            for every item.
          </p>
        </header>

        {/*
         * Two columns from `lg` up, and the reassurance is the column that is
         * always on screen. It used to sit below the submit button, so the most
         * calming thing on the page was the last thing anyone read.
         */}
        <div className="mt-7 grid items-start gap-8 lg:mt-9 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
          <div className="min-w-0">
            {entitlement.allowed ? (
              <UploadFlow />
            ) : (
              <Alert variant="warning" icon={<TriangleAlert aria-hidden="true" />}>
                <AlertTitle>Plan limit reached</AlertTitle>
                <AlertDescription>
                  <p>{entitlement.reason}</p>
                  <Button asChild size="sm" variant="secondary" className="mt-3">
                    <Link href="/app/settings#billing">View plans</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Card tone="sunken" elevation="flat" className="lg:sticky lg:top-20">
            <div className="card-pad">
              <h2 className="type-subhead flex items-center gap-2 text-foreground">
                <Lock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Your document stays private
              </h2>
              {/* --foreground-soft on --surface-sunken: 9.84:1 */}
              <ul className="mt-3 divide-y divide-border text-[13px] leading-relaxed text-foreground-soft">
                <li className="py-2.5 first:pt-0 last:pb-0">
                  It is stored in private storage that is not publicly reachable, and is only
                  accessible to members of {session.organization.name}.
                </li>
                <li className="py-2.5 first:pt-0 last:pb-0">
                  It is used to analyse this award. It is not used to train any model.
                </li>
                <li className="py-2.5 first:pt-0 last:pb-0">
                  You can delete the document, and everything extracted from it, at any time.
                </li>
                <li className="py-2.5 first:pt-0 last:pb-0">
                  Extracted text is sent to the configured AI provider for analysis. If no model is
                  configured, AwardLens uses a built-in deterministic extractor and makes no
                  external calls at all.
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
