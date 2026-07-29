import { describe, expect, it } from "vitest";

import {
  MAX_PASTED_CHARACTERS,
  MAX_UPLOAD_BYTES,
  hashContent,
  validatePastedText,
  validateUpload,
} from "@/lib/documents/validation";

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return { name: "award.pdf", type: "application/pdf", size: 1024, ...overrides };
}

describe("validateUpload — accepted types", () => {
  it.each([
    ["award.pdf", "pdf"],
    ["award.docx", "docx"],
    ["award.txt", "text"],
    ["notes.md", "text"],
  ])("accepts %s as kind %s", (name, kind) => {
    const result = validateUpload(file({ name, type: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe(kind);
  });

  it("is case insensitive about the extension", () => {
    const result = validateUpload(file({ name: "AWARD.PDF", type: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("pdf");
  });

  it("returns the filename, MIME type and byte size it accepted", () => {
    const result = validateUpload(file({ name: "grant.docx", type: "application/octet-stream", size: 4096 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        kind: "docx",
        filename: "grant.docx",
        mimeType: "application/octet-stream",
        byteSize: 4096,
      });
    }
  });

  it("substitutes a generic MIME type when the browser sends none", () => {
    const result = validateUpload(file({ name: "grant.pdf", type: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mimeType).toBe("application/octet-stream");
  });

  it("handles a filename with several dots", () => {
    const result = validateUpload(file({ name: "award.v2.final.docx", type: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("docx");
  });
});

describe("validateUpload — the extension is the primary signal", () => {
  it("lets the extension win over a misleading MIME type", () => {
    const result = validateUpload(
      file({ name: "award.txt", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("text");
  });

  it("does not trust a spreadsheet MIME type on a PDF filename", () => {
    const result = validateUpload(file({ name: "award.pdf", type: "application/vnd.ms-excel" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("pdf");
  });

  it("falls back to the MIME type only when the extension is unrecognised", () => {
    const result = validateUpload(file({ name: "award", type: "application/pdf" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("pdf");
  });
});

describe("validateUpload — rejections", () => {
  it("rejects an unsupported extension with an unsupported_type code", () => {
    const result = validateUpload(file({ name: "budget.xlsx", type: "application/vnd.ms-excel" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unsupported_type");
      expect(result.error.message).toContain("PDF, DOCX, and plain text");
    }
  });

  it("rejects a legacy .doc file", () => {
    const result = validateUpload(file({ name: "award.doc", type: "application/msword" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported_type");
  });

  it("rejects an image", () => {
    const result = validateUpload(file({ name: "scan.png", type: "image/png" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported_type");
  });

  it("rejects a zero-byte file before looking at its type", () => {
    const result = validateUpload(file({ name: "award.pdf", size: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("empty_file");
      expect(result.error.message).toContain("empty");
    }
  });

  it("rejects a zero-byte file even when the type is unsupported", () => {
    const result = validateUpload(file({ name: "payload.exe", type: "", size: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty_file");
  });

  it("rejects a file over 15 MB with a file_too_large code and the size in the message", () => {
    const result = validateUpload(file({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("file_too_large");
      expect(result.error.message).toContain("15 MB");
      expect(result.error.message).toContain("15.0 MB");
    }
  });

  it("accepts a file of exactly the maximum size", () => {
    expect(validateUpload(file({ size: MAX_UPLOAD_BYTES })).ok).toBe(true);
  });

  it("rejects a file with no name", () => {
    const result = validateUpload(file({ name: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("missing_file");
  });

  it("caps uploads at 15 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
  });
});

describe("validatePastedText", () => {
  it("accepts ordinary pasted text", () => {
    const result = validatePastedText("The Grantee shall submit an annual report.");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("text");
      expect(result.value.filename).toBe("pasted-text.txt");
      expect(result.value.mimeType).toBe("text/plain");
    }
  });

  it("reports the byte size of the trimmed text", () => {
    const result = validatePastedText("  abc  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.byteSize).toBe(3);
  });

  it("rejects an empty paste", () => {
    const result = validatePastedText("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("empty_file");
      expect(result.error.message).toContain("Paste the text");
    }
  });

  it("rejects a whitespace-only paste", () => {
    const result = validatePastedText("   \n\t  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty_file");
  });

  it("rejects text over the character limit and states both numbers", () => {
    const result = validatePastedText("x".repeat(MAX_PASTED_CHARACTERS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("text_too_long");
      expect(result.error.message).toContain("400,001 characters");
      expect(result.error.message).toContain("400,000");
    }
  });

  it("accepts text of exactly the character limit", () => {
    expect(validatePastedText("x".repeat(MAX_PASTED_CHARACTERS)).ok).toBe(true);
  });
});

describe("hashContent", () => {
  it("is stable for the same input", () => {
    expect(hashContent("the grant agreement")).toBe(hashContent("the grant agreement"));
  });

  it("differs for different input", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });

  it("differs for a single-character change in a long document", () => {
    const base = "The Grantee shall submit an annual report. ".repeat(500);
    expect(hashContent(base)).not.toBe(hashContent(`${base}.`));
  });

  it("produces a 64-character lowercase hex SHA-256 digest", () => {
    expect(hashContent("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashContent("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes a Buffer and an equivalent string identically", () => {
    expect(hashContent(Buffer.from("award", "utf8"))).toBe(hashContent("award"));
  });

  it("hashes a Uint8Array and an equivalent string identically", () => {
    expect(hashContent(new TextEncoder().encode("award"))).toBe(hashContent("award"));
  });

  it("is case sensitive", () => {
    expect(hashContent("Award")).not.toBe(hashContent("award"));
  });
});
