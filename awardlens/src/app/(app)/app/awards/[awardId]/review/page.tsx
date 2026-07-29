import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSession, requireSession } from "@/lib/auth";
import { getAwardWorkspace } from "@/lib/awards/queries";
import * as db from "@/lib/db/local";
import type { DocumentSegment } from "@/lib/domain/types";
import { ReviewWorkspace } from "@/components/obligations/review-workspace";

/**
 * The review route.
 *
 * Everything the workspace needs is resolved here, on the server, scoped to the
 * caller's organisation: the award, its obligations with citations, and the
 * stored text of the primary document so the source panel can show the passage
 * each item was drawn from.
 */

interface ReviewPageProps {
  // Next 16: dynamic params arrive as a promise.
  params: Promise<{ awardId: string }>;
}

export async function generateMetadata(props: ReviewPageProps): Promise<Metadata> {
  const { awardId } = await props.params;
  const session = await getSession();
  if (!session) return { title: "Review", robots: { index: false, follow: false } };

  const award = await db.getAward(awardId, session.organization.id);
  return {
    title: award ? `Review · ${award.name}` : "Review",
    description: "Check each extracted requirement against the passage it came from.",
    robots: { index: false, follow: false },
  };
}

export default async function ReviewPage(props: ReviewPageProps) {
  const { awardId } = await props.params;
  const session = await requireSession();

  const workspace = await getAwardWorkspace(awardId, session.organization.id);
  if (!workspace) notFound();

  const { award, obligations, documents, progress } = workspace;

  // The source panel shows one document at a time; the primary upload is the
  // one every citation on a freshly processed award points at.
  const primaryDocument = documents[0] ?? null;
  const segments: DocumentSegment[] = primaryDocument
    ? await db.listSegments(primaryDocument.id)
    : [];

  return (
    <ReviewWorkspace
      award={award}
      obligations={obligations}
      segments={segments}
      progress={progress}
      documentName={primaryDocument?.originalFilename ?? null}
      pageCount={primaryDocument?.pageCount ?? null}
    />
  );
}
