import { createHash } from "node:crypto";

/** Hard ceiling for uploads. Award documents are text; anything larger is a scan. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PASTED_CHARACTERS = 400_000;

export const ACCEPTED_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
  "text/markdown": "text",
} as const;

export type AcceptedKind = (typeof ACCEPTED_MIME_TYPES)[keyof typeof ACCEPTED_MIME_TYPES];

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

export type UploadRejectionCode =
  | "missing_file"
  | "unsupported_type"
  | "file_too_large"
  | "empty_file"
  | "text_too_long";

export interface UploadRejection {
  code: UploadRejectionCode;
  message: string;
}

export interface AcceptedUpload {
  kind: AcceptedKind;
  filename: string;
  mimeType: string;
  byteSize: number;
}

export type UploadValidation =
  | { ok: true; value: AcceptedUpload }
  | { ok: false; error: UploadRejection };

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

/**
 * Determines the document kind from the extension first and the browser-provided
 * MIME type second. Browsers disagree on DOCX and Markdown MIME types, and the
 * declared type is attacker-controlled, so the extension is the primary signal
 * and the real defence is that we only ever parse the bytes with a format-specific
 * parser that fails closed.
 */
export function validateUpload(file: {
  name: string;
  type: string;
  size: number;
}): UploadValidation {
  if (!file.name || file.size === undefined) {
    return { ok: false, error: { code: "missing_file", message: "No file was received." } };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: {
        code: "empty_file",
        message: "That file is empty. Please choose the award document you want to analyse.",
      },
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: {
        code: "file_too_large",
        message: `That file is ${mb} MB. AwardLens accepts documents up to 15 MB — large files are usually scans, which are not supported yet.`,
      },
    };
  }

  const extension = extensionOf(file.name);
  let kind: AcceptedKind | null = null;

  if (extension === ".pdf") kind = "pdf";
  else if (extension === ".docx") kind = "docx";
  else if (extension === ".txt" || extension === ".md") kind = "text";
  else {
    const byMime = ACCEPTED_MIME_TYPES[file.type as keyof typeof ACCEPTED_MIME_TYPES];
    if (byMime) kind = byMime;
  }

  if (!kind) {
    return {
      ok: false,
      error: {
        code: "unsupported_type",
        message:
          "AwardLens reads text-based PDF, DOCX, and plain text files. Scanned images, spreadsheets, and .doc files are not supported yet.",
      },
    };
  }

  return {
    ok: true,
    value: { kind, filename: file.name, mimeType: file.type || "application/octet-stream", byteSize: file.size },
  };
}

export function validatePastedText(text: string): UploadValidation {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: { code: "empty_file", message: "Paste the text of the award document to continue." },
    };
  }
  if (trimmed.length > MAX_PASTED_CHARACTERS) {
    return {
      ok: false,
      error: {
        code: "text_too_long",
        message: `That text is ${trimmed.length.toLocaleString()} characters. The limit is ${MAX_PASTED_CHARACTERS.toLocaleString()}.`,
      },
    };
  }
  return {
    ok: true,
    value: {
      kind: "text",
      filename: "pasted-text.txt",
      mimeType: "text/plain",
      byteSize: Buffer.byteLength(trimmed, "utf8"),
    },
  };
}

/** SHA-256 of the raw bytes — used for duplicate detection and idempotent retries. */
export function hashContent(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}
