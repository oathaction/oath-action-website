import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { processDueReminders } from "@/lib/reminders";
import { getServerConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: NextRequest, secret: string): boolean {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

/**
 * Daily reminder delivery.
 *
 * Protected by CRON_SECRET rather than a session: it is invoked by the platform
 * scheduler, not a user. Without the secret configured the endpoint refuses to
 * run at all — an unauthenticated job that can send email to your users is worse
 * than a job that does not run.
 */
export async function GET(request: NextRequest) {
  const config = getServerConfig();

  if (!config.cronSecret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET is not configured, so the reminder job is disabled. Set it in your environment and in the scheduler.",
      },
      { status: 503 },
    );
  }

  if (!authorised(request, config.cronSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await processDueReminders();
    console.info("[cron:reminders]", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron:reminders] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "Reminder run failed" }, { status: 500 });
  }
}

export const POST = GET;
