import { describe, expect, it } from "vitest";

import { PAGE_MARKER, parsePlainText, stripRunningHeadersAndFooters } from "@/lib/documents/parse";

import { readFixture } from "./_helpers/factories";

const BODY = (n: number) =>
  `Section ${n}. The Grantee shall submit a report describing the activities undertaken during the period covered by this section of the agreement.`;

function pagesWithRunningText(count: number, options: { headerOn?: number } = {}): string[] {
  const headerOn = options.headerOn ?? count;
  return Array.from({ length: count }, (_, index) =>
    [
      index < headerOn ? "ACME FOUNDATION — GRANT AGREEMENT AF-2026-01" : null,
      BODY(index + 1),
      `Page ${index + 1} of ${count}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

describe("stripRunningHeadersAndFooters", () => {
  it("removes a header and footer that repeat on every page", () => {
    const { pages, stripped } = stripRunningHeadersAndFooters(pagesWithRunningText(5));

    for (const page of pages) {
      expect(page).not.toContain("ACME FOUNDATION");
      expect(page).not.toMatch(/Page \d+ of 5/);
    }
    expect(stripped).toContain("ACME FOUNDATION — GRANT AGREEMENT AF-2026-01");
    expect(stripped.some((line) => /^Page \d+ of 5$/.test(line))).toBe(true);
  });

  it("masks page numbers before comparing, so Page 1 of 12 and Page 2 of 12 collapse", () => {
    const pages = Array.from({ length: 12 }, (_, index) =>
      `Page ${index + 1} of 12\n${BODY(index + 1)}`,
    );
    const { pages: cleaned, stripped } = stripRunningHeadersAndFooters(pages);

    expect(cleaned.every((page) => !/Page \d+ of 12/.test(page))).toBe(true);
    expect(stripped).toContain("Page 1 of 12");
    expect(stripped).toContain("Page 2 of 12");
  });

  it("keeps the substantive body text of every page", () => {
    const { pages } = stripRunningHeadersAndFooters(pagesWithRunningText(5));
    pages.forEach((page, index) => {
      expect(page).toContain(BODY(index + 1));
    });
  });

  it("leaves a document of fewer than three pages completely untouched", () => {
    const pages = pagesWithRunningText(2);
    const result = stripRunningHeadersAndFooters(pages);

    expect(result.pages).toBe(pages);
    expect(result.stripped).toEqual([]);
  });

  it("requires a line to appear on at least 60% of pages", () => {
    // 10 pages, threshold 6. A header on only 5 pages must survive.
    const { pages, stripped } = stripRunningHeadersAndFooters(
      pagesWithRunningText(10, { headerOn: 5 }),
    );

    expect(pages.slice(0, 5).every((page) => page.includes("ACME FOUNDATION"))).toBe(true);
    expect(stripped).not.toContain("ACME FOUNDATION — GRANT AGREEMENT AF-2026-01");
  });

  it("strips a header once it reaches the 60% threshold", () => {
    const { stripped } = stripRunningHeadersAndFooters(pagesWithRunningText(10, { headerOn: 6 }));
    expect(stripped).toContain("ACME FOUNDATION — GRANT AGREEMENT AF-2026-01");
  });

  it("never strips a long substantive line, however often it repeats", () => {
    const longClause =
      "The Grantee shall obtain the prior written approval of the Foundation before reallocating more than ten percent (10%) of the total award among the approved budget categories set out in Article 9 of this Agreement.";
    expect(longClause.length).toBeGreaterThan(120);

    const pages = Array.from({ length: 5 }, (_, index) => `${longClause}\n${BODY(index + 1)}`);
    const { pages: cleaned, stripped } = stripRunningHeadersAndFooters(pages);

    expect(cleaned.every((page) => page.includes(longClause))).toBe(true);
    expect(stripped).toEqual([]);
  });

  it("never strips a line that appears on only one page", () => {
    const pages = pagesWithRunningText(5);
    pages[2] = `${pages[2]}\n3.4 The Grantee shall notify the Foundation of any change in leadership.`;

    const { pages: cleaned } = stripRunningHeadersAndFooters(pages);
    expect(cleaned[2]).toContain("any change in leadership");
  });

  it("only considers lines near the top or bottom of a page as running text", () => {
    // A repeated line buried in the middle of every page is body text.
    const buried = "CONFIDENTIAL";
    const pages = Array.from(
      { length: 5 },
      (_, index) =>
        `${BODY(index + 1)}\n${BODY(index + 10)}\n${BODY(index + 20)}\n${buried}\n${BODY(index + 30)}\n${BODY(index + 40)}\n${BODY(index + 50)}`,
    );

    const { pages: cleaned } = stripRunningHeadersAndFooters(pages);
    expect(cleaned.every((page) => page.includes(buried))).toBe(true);
  });

  it("returns the pages unchanged when nothing repeats", () => {
    const headings = ["Purpose", "Payment", "Reporting", "Records"];
    const pages = headings.map((heading, index) => `${heading}\n${BODY(index)}`);
    const result = stripRunningHeadersAndFooters(pages);

    expect(result.pages).toBe(pages);
    expect(result.stripped).toEqual([]);
  });

  it("treats lines that differ only in digits as the same running text", () => {
    // "Unique heading 1" and "Unique heading 2" share a signature by design.
    const pages = Array.from({ length: 4 }, (_, index) => `Unique heading ${index}\n${BODY(index)}`);
    const { stripped } = stripRunningHeadersAndFooters(pages);

    expect(stripped).toContain("Unique heading 0");
    expect(stripped).toContain("Unique heading 3");
  });

  it("caps the transparency list of stripped lines at ten entries", () => {
    const pages = Array.from({ length: 20 }, (_, index) => `Page ${index + 1} of 20\n${BODY(index)}`);
    expect(stripRunningHeadersAndFooters(pages).stripped.length).toBeLessThanOrEqual(10);
  });

  it("strips the running header and footer from the real repeated-headers fixture", () => {
    const parsed = parsePlainText(readFixture("08-repeated-headers-footers.txt"));

    expect(parsed.status).toBe("parsed");
    expect(parsed.strippedRunningText).toContain("CONSOLIDATED REGIONAL ARTS COUNCIL");
    expect(parsed.strippedRunningText.some((line) => line.includes("CONFIDENTIAL"))).toBe(true);
    for (const block of parsed.blocks) {
      expect(block.text).not.toContain("CONSOLIDATED REGIONAL ARTS COUNCIL\n");
      expect(block.text).not.toMatch(/Page \d of 7 \| Form GOS-2/);
    }
    // The substantive deadlines survive the cleaning.
    const all = parsed.blocks.map((block) => block.text).join("\n");
    expect(all).toContain("mid-year report no later than February 28, 2027");
    expect(all).toContain("final report no later than October 30, 2027");
  });
});

describe("parsePlainText — page markers", () => {
  const TOPICS = ["purpose", "payment", "reporting", "records", "publicity"];
  /** Distinct multi-line page content, so header stripping has nothing to find. */
  const page = (n: number) =>
    [
      `ARTICLE ${n}. ${TOPICS[n - 1].toUpperCase()}`,
      `${n}.1 The Grantee shall carry out the ${TOPICS[n - 1]} obligations of this Agreement in full.`,
      `${n}.2 The Foundation may request evidence relating to ${TOPICS[n - 1]} at any reasonable time.`,
    ].join("\n");

  it("honours page markers and emits page locators", () => {
    const result = parsePlainText([page(1), page(2), page(3)].join(`\n${PAGE_MARKER}\n`));

    expect(result.status).toBe("parsed");
    expect(result.pageCount).toBe(3);
    expect(result.blocks.map((block) => block.locatorType)).toEqual(["page", "page", "page"]);
    expect(result.blocks.map((block) => block.locatorValue)).toEqual(["1", "2", "3"]);
  });

  it("keeps each page's own text on its own block", () => {
    const result = parsePlainText([page(1), page(2)].join(`\n${PAGE_MARKER}\n`));
    expect(result.blocks[0].text).toContain("ARTICLE 1.");
    expect(result.blocks[0].text).not.toContain("ARTICLE 2.");
    expect(result.blocks[1].text).toContain("ARTICLE 2.");
  });

  it("does not renumber later pages when an intermediate page is blank", () => {
    const result = parsePlainText([page(1), "", page(3)].join(`\n${PAGE_MARKER}\n`));

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.map((block) => block.locatorValue)).toEqual(["1", "3"]);
  });

  it("gives the real fixture one page block per marked page", () => {
    const result = parsePlainText(readFixture("01-simple-foundation-grant.txt"));

    expect(result.status).toBe("parsed");
    expect(result.pageCount).toBe(5);
    expect(result.blocks).toHaveLength(5);
    expect(result.blocks.every((block) => block.locatorType === "page")).toBe(true);
    expect(result.blocks[2].text).toContain("ARTICLE III. REPORTING");
  });
});

describe("parsePlainText — paragraph numbering", () => {
  it("numbers paragraphs when the text has no page markers", () => {
    const result = parsePlainText(
      ["First paragraph of the agreement text.", "Second paragraph.", "Third paragraph here."].join(
        "\n\n",
      ),
    );

    expect(result.status).toBe("parsed");
    expect(result.pageCount).toBeNull();
    expect(result.blocks.map((block) => block.locatorType)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(result.blocks.map((block) => block.locatorValue)).toEqual(["1", "2", "3"]);
    expect(result.blocks[1].text).toBe("Second paragraph.");
  });

  it("labels the locator honestly rather than claiming a page it cannot see", () => {
    const result = parsePlainText("A".repeat(100));
    expect(result.blocks[0].locatorType).toBe("paragraph");
    expect(result.pageCount).toBeNull();
  });

  it("normalises CRLF line endings and collapses runaway blank lines", () => {
    const result = parsePlainText("First paragraph text here.\r\n\r\n\r\n\r\nSecond paragraph text.");
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].text).toBe("First paragraph text here.");
  });

  it("reports no stripped running text for a marker-free document", () => {
    const result = parsePlainText("A paragraph of at least forty characters in it.");
    expect(result.strippedRunningText).toEqual([]);
  });
});

describe("parsePlainText — rejection", () => {
  it("rejects text that is too short to analyse", () => {
    const result = parsePlainText("Too short.");

    expect(result.status).toBe("no_text_layer");
    expect(result.blocks).toEqual([]);
    expect(result.message).toContain("not enough text");
  });

  it("rejects an empty string", () => {
    expect(parsePlainText("").status).toBe("no_text_layer");
    expect(parsePlainText("   \n\n  ").status).toBe("no_text_layer");
  });

  it("rejects paginated text whose pages carry almost no characters", () => {
    const result = parsePlainText(readFixture("11-empty-scanned.txt"));

    expect(result.status).toBe("no_text_layer");
    expect(result.blocks).toEqual([]);
    expect(result.message).toContain("no readable text layer");
  });

  it("does not crash on form feed characters in a scanned document", () => {
    expect(() => parsePlainText(`\f\f\f${PAGE_MARKER}\f 3 . 1 4`)).not.toThrow();
  });

  it("accepts text just over the minimum length", () => {
    const result = parsePlainText("A".repeat(41));
    expect(result.status).toBe("parsed");
  });
});
