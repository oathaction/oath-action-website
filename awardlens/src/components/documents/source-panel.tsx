"use client";

import * as React from "react";
import { AlertTriangle, FileText } from "lucide-react";

import type { DocumentSegment, ObligationCitation } from "@/lib/domain/types";
import { formatLocator } from "@/lib/documents/segment";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/misc";

/**
 * The source panel — the other half of the promise the Evidence Rail makes.
 *
 * The rail says "this came from page 7". This panel shows page 7, as stored,
 * with the cited sentence marked. Three rules keep it honest:
 *
 *  1. Only ever plain text. Document content is untrusted user input and is
 *     never interpreted as markup.
 *  2. The text shown is the text AwardLens actually analysed — not a re-render
 *     of the original PDF — and the header says so.
 *  3. If we cannot find the quoted passage in the stored text we say that,
 *     rather than highlighting a nearby sentence and implying it is the source.
 *
 * Visually it is a *document object*, not another card: `--paper` under
 * `--ink-document`, chrome reduced to two hairlines, and the marked sentence as
 * the only thing on the panel allowed to carry colour. The panel used to wash
 * the active passage in `--warning-subtle`, which borrowed the alert colour for
 * something that is not an alert and left the whole column reading muddy;
 * `--highlight-wash` / `--highlight-subtle` exist precisely so a citation looks
 * marked rather than broken.
 */

interface SourcePanelProps {
  segments: DocumentSegment[];
  /** The citation currently being examined, or null when nothing is selected. */
  activeCitation: ObligationCitation | null;
  documentName: string | null;
  /** Page count reported by the parser, when the document had one. */
  pageCount?: number | null;
  className?: string;
  /** Extra header content — used for the drawer's close affordance on mobile. */
  headerAction?: React.ReactNode;
}

interface Highlight {
  start: number;
  end: number;
}

/**
 * Finds the cited passage inside a stored segment.
 *
 * Stored offsets are preferred because they were computed against this exact
 * text. They are still bounds-checked: a stale offset must degrade to "we
 * could not locate this", never to a highlight over the wrong words.
 */
export function locateExcerpt(
  segmentText: string,
  citation: Pick<ObligationCitation, "excerpt" | "startOffset" | "endOffset">,
): Highlight | null {
  const { startOffset, endOffset } = citation;
  if (
    startOffset !== null &&
    endOffset !== null &&
    startOffset >= 0 &&
    endOffset > startOffset &&
    endOffset <= segmentText.length
  ) {
    return { start: startOffset, end: endOffset };
  }

  const needle = citation.excerpt.trim();
  if (needle.length > 0) {
    const index = segmentText.toLowerCase().indexOf(needle.toLowerCase());
    if (index !== -1) return { start: index, end: index + needle.length };
  }

  return null;
}

interface SegmentGroup {
  key: string;
  label: string;
  heading: string | null;
  segments: DocumentSegment[];
}

/** Consecutive segments that share a locator are shown under one heading. */
function groupSegments(segments: DocumentSegment[]): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  for (const segment of segments) {
    const key = `${segment.locatorType}:${segment.locatorValue}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.segments.push(segment);
      if (!last.heading && segment.heading) last.heading = segment.heading;
      continue;
    }
    groups.push({
      key,
      label: formatLocator(segment.locatorType, segment.locatorValue),
      heading: segment.heading,
      segments: [segment],
    });
  }
  return groups;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SourcePanel({
  segments,
  activeCitation,
  documentName,
  pageCount,
  className,
  headerAction,
}: SourcePanelProps) {
  const groups = React.useMemo(() => groupSegments(segments), [segments]);
  const segmentRefs = React.useRef(new Map<string, HTMLElement>());

  const activeSegmentId = activeCitation?.documentSegmentId ?? null;
  const activeCitationId = activeCitation?.id ?? null;

  React.useEffect(() => {
    if (!activeSegmentId) return;
    const node = segmentRefs.current.get(activeSegmentId);
    if (!node) return;
    node.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeSegmentId, activeCitationId]);

  const setSegmentRef = React.useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) segmentRefs.current.set(id, node);
      else segmentRefs.current.delete(id);
    },
    [],
  );

  const locatorNoun =
    segments.length > 0 && segments[0].locatorType === "page"
      ? groups.length === 1
        ? "page"
        : "pages"
      : segments.length > 0 && segments[0].locatorType === "section"
        ? groups.length === 1
          ? "section"
          : "sections"
        : groups.length === 1
          ? "paragraph"
          : "paragraphs";

  /**
   * The citation points at a segment we do not have — for example because it
   * belongs to a second uploaded document. Say so instead of showing nothing.
   */
  const activeSegmentMissing =
    activeSegmentId !== null && !segments.some((segment) => segment.id === activeSegmentId);

  return (
    <div
      className={cn(
        // Paper, not surface. This is the one panel on the screen that is a
        // document rather than a piece of interface, and it should read that way
        // against the warm ivory page.
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-paper-border bg-paper shadow-resting",
        className,
      )}
    >
      {/*
        Chrome, reduced to what it has to say: which file this is, and the
        standing caveat that it is our stored text rather than the original.
        Previously a filled sunken bar with 14px semibold over two lines of
        12px — heavier than the document it frames.
      */}
      <div className="flex shrink-0 items-start gap-2.5 border-b border-paper-border px-4 py-2.5">
        <FileText
          className="mt-[3px] size-3.5 shrink-0 text-ink-document-soft"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2
            id="source-panel-heading"
            className="truncate text-[13px] font-semibold tracking-[-0.011em] text-ink-document"
          >
            {documentName ?? "Source document"}
          </h2>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-ink-document-soft">
            {segments.length > 0 ? (
              <>
                <span className="tabular font-mono">
                  {groups.length} {locatorNoun}
                </span>
                {typeof pageCount === "number" && pageCount > 0 ? (
                  <>
                    {" · "}
                    <span className="tabular font-mono">
                      {pageCount} {pageCount === 1 ? "page" : "pages"} in the file
                    </span>
                  </>
                ) : null}
                {" · "}
              </>
            ) : null}
            This is the stored text AwardLens actually analysed, not the original file.
          </p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      {/*
        Focusable and named on purpose.

        This region scrolls through the whole stored document — often many
        screens — and contains no interactive elements, so without tabIndex
        there is nothing for a keyboard user to focus and no way to scroll it.
        That would make the source panel mouse-only, and this panel is where a
        user goes to check that an obligation really does come from the page the
        Evidence Rail claims. Verifying the citation is the product's core
        promise; it cannot be reserved for people with a pointer.

        The accessible name matters as much as the focusability: a bare
        tabIndex={0} satisfies the tooling but drops a screen-reader user into
        an anonymous scrollable group. Labelling it by the document heading
        means focus lands somewhere that announces what it is.
      */}
      <div
        role="region"
        aria-labelledby="source-panel-heading"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {segments.length === 0 ? (
          <EmptyState
            bordered={false}
            headingLevel={3}
            className="min-h-[14rem]"
            title="No stored text for this award"
            description="We could not read any text out of the uploaded file, so there is nothing to compare these items against. Check the document against the award yourself before relying on anything below."
          />
        ) : (
          <>
            {activeSegmentMissing ? (
              <p className="flex items-start gap-2 border-b border-warning-border bg-warning-subtle px-4 py-2 text-xs leading-relaxed text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                The passage cited by this item is not in the document shown here.
              </p>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                {/*
                  Opaque paper, not a translucent blur. Blurring a document a
                  person is checking a claim against is a legibility cost the
                  product cannot justify.
                */}
                <h3 className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-paper-border bg-paper px-4 py-1.5 text-[11.5px] text-ink-document-soft">
                  <span className="tabular shrink-0 font-mono font-medium tracking-[-0.01em] text-ink-document">
                    {group.label}
                  </span>
                  {group.heading ? <span className="truncate">{group.heading}</span> : null}
                </h3>
                <div className="space-y-3 px-3 py-3.5">
                  {group.segments.map((segment) => (
                    <SegmentText
                      key={segment.id}
                      ref={setSegmentRef(segment.id)}
                      segment={segment}
                      citation={activeSegmentId === segment.id ? activeCitation : null}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

interface SegmentTextProps {
  segment: DocumentSegment;
  citation: ObligationCitation | null;
  ref?: React.Ref<HTMLDivElement>;
}

function SegmentText({ segment, citation, ref }: SegmentTextProps) {
  const highlight = citation ? locateExcerpt(segment.text, citation) : null;
  const isActive = citation !== null;

  return (
    <div
      ref={ref}
      data-active={isActive ? "true" : undefined}
      className={cn(
        "scroll-mt-12 rounded-md border-l-2 px-3 py-1.5 transition-colors",
        // --highlight-rule is 3.32:1 on --paper, so the active edge clears the
        // 3:1 asked of a non-text boundary.
        isActive ? "border-highlight-rule bg-highlight-wash" : "border-transparent",
      )}
    >
      {isActive ? (
        highlight ? (
          <p className="eyebrow mb-1.5 flex items-center gap-1.5 text-ink-document-soft">
            <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-highlight-rule" />
            Cited passage, marked below
          </p>
        ) : (
          <p className="mb-1.5 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            We could not locate this passage in the stored text — nothing is marked below.
          </p>
        )
      ) : null}

      <p className="evidence-quote whitespace-pre-wrap break-words">
        {highlight ? (
          <>
            {segment.text.slice(0, highlight.start)}
            <mark className="evidence-mark box-decoration-clone px-0.5">
              <span className="sr-only">Start of cited passage. </span>
              {segment.text.slice(highlight.start, highlight.end)}
              <span className="sr-only"> End of cited passage.</span>
            </mark>
            {segment.text.slice(highlight.end)}
          </>
        ) : (
          segment.text
        )}
      </p>
    </div>
  );
}
