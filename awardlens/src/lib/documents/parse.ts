import type { LocatorType, ParserStatus } from "@/lib/domain/types";
import { inspectZipExpansion, MAX_PASTED_CHARACTERS, type AcceptedKind } from "./validation";

export interface ParsedBlock {
  locatorType: LocatorType;
  locatorValue: string;
  heading: string | null;
  text: string;
}

export interface ParseResult {
  status: ParserStatus;
  message: string | null;
  pageCount: number | null;
  blocks: ParsedBlock[];
  /** Header/footer lines removed during cleaning, kept for transparency. */
  strippedRunningText: string[];
}

/** Below this, a PDF has no meaningful text layer and is almost certainly a scan. */
const MIN_USABLE_CHARACTERS = 200;

export const PAGE_MARKER = "[[PAGE]]";

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Removes headers and footers that repeat across most pages.
 *
 * Digits are masked before comparison so "Page 3 of 12" and "Page 4 of 12"
 * collapse to the same signature. We only strip short lines that appear on at
 * least 60% of pages of a document with 3+ pages — well short of anything that
 * could remove a substantive requirement.
 */
export function stripRunningHeadersAndFooters(pages: string[]): {
  pages: string[];
  stripped: string[];
} {
  if (pages.length < 3) return { pages, stripped: [] };

  const CANDIDATE_LINES_PER_EDGE = 3;
  const MAX_LINE_LENGTH = 120;
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));

  const signature = (line: string) => line.replace(/\d+/g, "#").trim().toLowerCase();
  const counts = new Map<string, number>();

  for (const page of pages) {
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    const edges = [
      ...lines.slice(0, CANDIDATE_LINES_PER_EDGE),
      ...lines.slice(-CANDIDATE_LINES_PER_EDGE),
    ];
    // Count each distinct signature once per page.
    const seen = new Set<string>();
    for (const line of edges) {
      if (line.length > MAX_LINE_LENGTH) continue;
      const sig = signature(line);
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      counts.set(sig, (counts.get(sig) ?? 0) + 1);
    }
  }

  const repeating = new Set(
    [...counts.entries()].filter(([, count]) => count >= threshold).map(([sig]) => sig),
  );
  if (repeating.size === 0) return { pages, stripped: [] };

  const stripped = new Set<string>();
  const cleaned = pages.map((page) => {
    const lines = page.split("\n");
    const kept = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > MAX_LINE_LENGTH) return true;
      if (repeating.has(signature(trimmed))) {
        stripped.add(trimmed);
        return false;
      }
      return true;
    });
    return kept.join("\n").trim();
  });

  return { pages: cleaned, stripped: [...stripped].slice(0, 10) };
}

function pagesToResult(rawPages: string[], pageCount: number): ParseResult {
  const { pages, stripped } = stripRunningHeadersAndFooters(
    rawPages.map((page) => normaliseWhitespace(page)),
  );

  const blocks: ParsedBlock[] = [];
  pages.forEach((text, index) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    blocks.push({
      locatorType: "page",
      locatorValue: String(index + 1),
      heading: null,
      text: cleaned,
    });
  });

  const usableCharacters = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (usableCharacters < MIN_USABLE_CHARACTERS) {
    return {
      status: "no_text_layer",
      message:
        "This PDF has no readable text layer, which usually means it is a scan or photo. AwardLens does not support scanned documents yet — you can paste the text instead.",
      pageCount,
      blocks: [],
      strippedRunningText: stripped,
    };
  }

  return { status: "parsed", message: null, pageCount, blocks, strippedRunningText: stripped };
}

export async function parsePdf(data: Uint8Array): Promise<ParseResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");

  try {
    // Load first so encrypted / corrupt files fail before text extraction.
    const proxy = await getDocumentProxy(data);
    const { totalPages, text } = await extractText(proxy, { mergePages: false });
    return pagesToResult(text, totalPages);
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : String(error);

    if (name === "PasswordException" || /password/i.test(message)) {
      return {
        status: "password_protected",
        message:
          "This PDF is password protected. Remove the password and upload it again — AwardLens cannot open encrypted files.",
        pageCount: null,
        blocks: [],
        strippedRunningText: [],
      };
    }

    if (name === "InvalidPDFException" || /invalid pdf|structure/i.test(message)) {
      return {
        status: "corrupted",
        message:
          "This PDF could not be opened — the file appears to be damaged. Try re-downloading it from the funder, or paste the text instead.",
        pageCount: null,
        blocks: [],
        strippedRunningText: [],
      };
    }

    return {
      status: "failed",
      message: "We could not read this PDF. Try re-saving it, or paste the text instead.",
      pageCount: null,
      blocks: [],
      strippedRunningText: [],
    };
  }
}

/** Minimal HTML unescaping for the subset mammoth emits. */
function decodeEntities(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export async function parseDocx(data: Buffer): Promise<ParseResult> {
  // Reject a compression bomb before any bytes are inflated.
  const expansion = inspectZipExpansion(data);
  if (!expansion.ok) {
    return {
      status: "unsupported",
      message: `${expansion.reason} AwardLens will not open it. If this is a genuine award document, paste its text instead.`,
      pageCount: null,
      blocks: [],
      strippedRunningText: [],
    };
  }

  let html: string;
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ buffer: data });
    html = result.value;
  } catch {
    return {
      status: "corrupted",
      message:
        "This Word file could not be opened. If it is an older .doc file, save it as .docx and try again.",
      pageCount: null,
      blocks: [],
      strippedRunningText: [],
    };
  }

  // Word gives us no page boundaries, so we key locators to headings and
  // paragraph numbers. We never claim a page number we cannot see.
  const elementPattern = /<(h[1-6]|p|li|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const blocks: ParsedBlock[] = [];
  let currentHeading: string | null = null;
  let sectionIndex = 0;
  let paragraphIndex = 0;
  let buffer: string[] = [];

  const flushSection = () => {
    if (buffer.length === 0) return;
    blocks.push({
      locatorType: "section",
      locatorValue: String(sectionIndex),
      heading: currentHeading,
      text: normaliseWhitespace(buffer.join("\n\n")),
    });
    buffer = [];
  };

  for (const match of html.matchAll(elementPattern)) {
    const tag = match[1].toLowerCase();
    const text = decodeEntities(match[2]).trim();
    if (!text) continue;

    if (tag.startsWith("h")) {
      flushSection();
      sectionIndex += 1;
      currentHeading = text;
      buffer.push(text);
    } else {
      paragraphIndex += 1;
      if (currentHeading === null && buffer.length === 0) {
        // Front matter before the first heading keeps paragraph locators.
        blocks.push({
          locatorType: "paragraph",
          locatorValue: String(paragraphIndex),
          heading: null,
          text: normaliseWhitespace(text),
        });
        continue;
      }
      buffer.push(text);
    }
  }
  flushSection();

  const usable = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (usable < MIN_USABLE_CHARACTERS) {
    return {
      status: "no_text_layer",
      message:
        "This Word document contains almost no text. If the content is an embedded image, AwardLens cannot read it yet.",
      pageCount: null,
      blocks: [],
      strippedRunningText: [],
    };
  }

  return { status: "parsed", message: null, pageCount: null, blocks, strippedRunningText: [] };
}

/**
 * Parses plain text. When the text carries explicit page markers (as our
 * fixtures and some copy-paste flows do) we honour them and emit page locators;
 * otherwise we number paragraphs and label the locator honestly.
 */
export function parsePlainText(raw: string): ParseResult {
  // The same ceiling the paste field enforces. Without it, uploading identical
  // content as a .txt file would allow 15 MB through a path that the paste box
  // caps at 400,000 characters.
  const bounded = raw.length > MAX_PASTED_CHARACTERS ? raw.slice(0, MAX_PASTED_CHARACTERS) : raw;
  const normalised = normaliseWhitespace(bounded);
  if (normalised.length < 40) {
    return {
      status: "no_text_layer",
      message: "There is not enough text here to analyse. Paste the full award document.",
      pageCount: null,
      blocks: [],
      strippedRunningText: [],
    };
  }

  if (normalised.includes(PAGE_MARKER)) {
    const pages = normalised.split(PAGE_MARKER);
    return pagesToResult(pages, pages.length);
  }

  const paragraphs = normalised
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const blocks: ParsedBlock[] = paragraphs.map((text, index) => ({
    locatorType: "paragraph" as const,
    locatorValue: String(index + 1),
    heading: null,
    text,
  }));

  return { status: "parsed", message: null, pageCount: null, blocks, strippedRunningText: [] };
}

export async function parseDocument(
  kind: AcceptedKind,
  data: Buffer,
): Promise<ParseResult> {
  switch (kind) {
    case "pdf":
      return parsePdf(new Uint8Array(data));
    case "docx":
      return parseDocx(data);
    case "text":
      return parsePlainText(data.toString("utf8"));
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported document kind: ${String(exhaustive)}`);
    }
  }
}
