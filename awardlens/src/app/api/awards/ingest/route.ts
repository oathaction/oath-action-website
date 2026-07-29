import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { ingestDocument } from "@/lib/awards/process";
import {
  MAX_UPLOAD_BYTES,
  validatePastedText,
  validateUpload,
} from "@/lib/documents/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { SAMPLE_AWARD_FILENAME, SAMPLE_AWARD_TEXT } from "@/lib/samples/sample-award";
import type { ProcessingStage } from "@/lib/domain/types";

// PDF parsing and the AI SDK need Node APIs; this route must not run on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export interface IngestEvent {
  type: "stage" | "done" | "error";
  stage?: ProcessingStage;
  awardId?: string;
  duplicate?: boolean;
  obligationCount?: number;
  warnings?: string[];
  code?: string;
  message?: string;
}

function line(event: IngestEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * Uploads and analyses a document, streaming real stage transitions as
 * newline-delimited JSON.
 *
 * Streaming rather than returning at the end serves two purposes: the user sees
 * genuine progress instead of a fabricated percentage, and a long extraction
 * does not sit behind a silent request that looks hung.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { type: "error", code: "unauthorized", message: "Sign in to analyse an award." },
      { status: 401 },
    );
  }

  const limit = checkRateLimit(`upload:${session.organization.id}`, RATE_LIMITS.upload);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        type: "error",
        code: "rate_limited",
        message: `You have uploaded a lot of documents in a short time. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { type: "error", code: "bad_request", message: "The upload could not be read." },
      { status: 400 },
    );
  }

  const awardNameRaw = form.get("awardName");
  const awardName = typeof awardNameRaw === "string" && awardNameRaw.trim() ? awardNameRaw.trim().slice(0, 120) : null;

  const useSample = form.get("sample") === "true";
  const pasted = form.get("text");
  const file = form.get("file");

  let bytes: Buffer;
  let filename: string;
  let mimeType: string;
  let kind: "pdf" | "docx" | "text";
  let sourceType: "pdf" | "docx" | "text" | "sample";

  if (useSample) {
    bytes = Buffer.from(SAMPLE_AWARD_TEXT, "utf8");
    filename = SAMPLE_AWARD_FILENAME;
    mimeType = "text/plain";
    kind = "text";
    sourceType = "sample";
  } else if (typeof pasted === "string" && pasted.trim().length > 0) {
    const validation = validatePastedText(pasted);
    if (!validation.ok) {
      return NextResponse.json(
        { type: "error", code: validation.error.code, message: validation.error.message },
        { status: 400 },
      );
    }
    bytes = Buffer.from(pasted.trim(), "utf8");
    filename = validation.value.filename;
    mimeType = "text/plain";
    kind = "text";
    sourceType = "text";
  } else if (file && typeof file === "object" && "arrayBuffer" in file) {
    const candidate = file as File;
    const validation = validateUpload({
      name: candidate.name,
      type: candidate.type,
      size: candidate.size,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { type: "error", code: validation.error.code, message: validation.error.message },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await candidate.arrayBuffer());
    // Re-check the real byte length: the declared size is client-controlled.
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { type: "error", code: "file_too_large", message: "That file is larger than 15 MB." },
        { status: 413 },
      );
    }

    bytes = buffer;
    filename = validation.value.filename;
    mimeType = validation.value.mimeType;
    kind = validation.value.kind;
    sourceType = validation.value.kind;
  } else {
    return NextResponse.json(
      {
        type: "error",
        code: "missing_file",
        message: "Choose a file, paste the award text, or use the sample document.",
      },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (event: IngestEvent) => {
        try {
          controller.enqueue(line(event));
        } catch {
          // Client disconnected; processing continues so the award is not lost.
        }
      };

      try {
        const result = await ingestDocument(
          { session, kind, sourceType, filename, mimeType, bytes, awardName },
          { onStage: (stage) => safeEnqueue({ type: "stage", stage }) },
        );

        if (result.ok) {
          safeEnqueue({
            type: "done",
            awardId: result.awardId,
            duplicate: result.duplicate,
            obligationCount: result.obligationCount,
            warnings: result.warnings,
          });
        } else {
          safeEnqueue({
            type: "error",
            code: result.error.code,
            message: result.error.message,
            awardId: result.error.awardId,
          });
        }
      } catch (error) {
        console.error("[ingest] unexpected failure", {
          organizationId: session.organization.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        safeEnqueue({
          type: "error",
          code: "unexpected",
          message: "Something went wrong while analysing this document. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
