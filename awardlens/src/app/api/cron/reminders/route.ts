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

  // Compare BYTE lengths, not string lengths. `String.length` counts UTF-16
  // code units, so a header with the same character count but a multi-byte
  // character would pass that check and then make timingSafeEqual throw
  // RangeError — turning a failed authorisation into an unhandled 500.
  const providedBytes = Buffer.from(provided, "utf8");
  const secretBytes = Buffer.from(secret, "utf8");
  if (providedBytes.length !== secretBytes.length) return false;
  return timingSafeEqual(providedBytes, secretBytes);
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
