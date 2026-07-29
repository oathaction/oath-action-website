import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { getAwardWorkspace } from "@/lib/awards/queries";
import { obligationsToCsv } from "@/lib/exports/csv";
import { obligationsToIcs } from "@/lib/exports/ics";
import { buildJsonExport } from "@/lib/exports/json";
import * as db from "@/lib/db";
import { getServerConfig } from "@/lib/env";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { ExportFormat } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS: Record<string, { contentType: string; extension: string }> = {
  csv: { contentType: "text/csv; charset=utf-8", extension: "csv" },
  ics: { contentType: "text/calendar; charset=utf-8", extension: "ics" },
  json: { contentType: "application/json; charset=utf-8", extension: "json" },
};

/** Filenames end up in a Content-Disposition header — strip anything structural. */
function safeFilename(name: string, extension: string): string {
  const base =
    name
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 60) || "award";
  return `awardlens-${base}.${extension}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ awardId: string; format: string }> },
) {
  const { awardId, format } = await context.params;

  const session = await getSession();
  // An unauthenticated request must not be able to distinguish "no such award"
  // from "not yours" — both are 404.
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const spec = FORMATS[format];
  if (!spec) {
    return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  }

  const limit = checkRateLimit(`export:${session.organization.id}`, RATE_LIMITS.export);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many exports. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const workspace = await getAwardWorkspace(awardId, session.organization.id);
  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { award, obligations } = workspace;
  const config = getServerConfig();
  const includeUnconfirmed = request.nextUrl.searchParams.get("includeUnconfirmed") === "true";

  let body: string;
  if (format === "csv") {
    body = obligationsToCsv(award, obligations);
  } else if (format === "ics") {
    body = obligationsToIcs(award, obligations, {
      includeUnconfirmed,
      appUrl: `${config.appUrl}/app/awards/${award.id}`,
    });
  } else {
    body = JSON.stringify(buildJsonExport(award, obligations, workspace.documents), null, 2);
  }

  await db.recordExport({
    awardId: award.id,
    organizationId: session.organization.id,
    format: format as ExportFormat,
    storagePath: null,
    generatedBy: session.profile.id,
  });

  return new Response(body, {
    headers: {
      "Content-Type": spec.contentType,
      "Content-Disposition": `attachment; filename="${safeFilename(award.name, spec.extension)}"`,
      "Cache-Control": "no-store",
    },
  });
}
