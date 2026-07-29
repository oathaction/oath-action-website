"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookOpen,
  Check,
  CheckCheck,
  Download,
  Keyboard,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  Quote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  bulkConfirmAction,
  deleteObligationAction,
  setReviewStatusAction,
} from "@/app/actions/obligations";
import type { ReviewProgress } from "@/lib/awards/queries";
import { formatLocator } from "@/lib/documents/segment";
import {
  CATEGORY_META,
  type Award,
  type DocumentSegment,
  type ObligationCitation,
  type ObligationWithCitations,
  type ReviewStatus,
} from "@/lib/domain/types";
import { cn, formatIsoDate } from "@/lib/utils";
import {
  ConfidenceBadge,
  EvidenceRail,
  ReviewStatusBadge,
  SourceStatusBadge,
} from "@/components/evidence/evidence-rail";
import { ObligationEditor } from "@/components/obligations/obligation-editor";
import { SourcePanel } from "@/components/documents/source-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from "@/components/ui/dialog";
import { EmptyState, Kbd, Progress } from "@/components/ui/misc";

/**
 * The review workspace — the screen the whole product exists to serve.
 *
 * A person works one obligation at a time with the document open beside it.
 * Nothing here confirms itself: every status change is a deliberate act, bulk
 * confirmation is restricted to items whose source we actually verified, and
 * deletion always asks first.
 *
 * Three things carry the layout:
 *
 *  1. On a wide screen it is a two-pane workspace of a fixed height — document
 *     left, queue right, each scrolling inside itself. It used to be one long
 *     page with a sticky document column, which left several hundred pixels of
 *     empty background beside the lower half of the queue and pushed the filter
 *     chips out of reach the moment you started reading.
 *  2. The queue encodes the ordinary case as cheaply as it can. Thirteen rows
 *     that all say the same thing in a filled pill is ink spent to say nothing,
 *     so "Needs review" is plain text at the end of the metadata run and the
 *     loud treatment is kept for the exceptions — an unverified source,
 *     conflicting dates, critical priority, a low-confidence extraction. The
 *     coloured rail on the left of a row is silent until a decision is made.
 *  3. The open item is the one raised object on the screen, and its action row
 *     is an emphasis ladder rather than six equal buttons: Confirm is the
 *     action, "Needs clarification" and "Not applicable" are the plausible
 *     alternatives, Edit and Delete are record-keeping and sit apart.
 */

interface ReviewWorkspaceProps {
  award: Award;
  obligations: ObligationWithCitations[];
  segments: DocumentSegment[];
  progress: ReviewProgress;
  documentName?: string | null;
  pageCount?: number | null;
}

type FilterKey =
  | "all"
  | "needs_review"
  | "low_confidence"
  | "unverified"
  | "conflicts"
  | "confirmed";

interface FilterDefinition {
  key: FilterKey;
  label: string;
  description: string;
  match: (obligation: ObligationWithCitations) => boolean;
}

const FILTERS: FilterDefinition[] = [
  { key: "all", label: "All", description: "Every item on this award.", match: () => true },
  {
    key: "needs_review",
    label: "Needs review",
    description: "Nobody has made a decision on these yet.",
    match: (obligation) => obligation.reviewStatus === "needs_review",
  },
  {
    key: "low_confidence",
    label: "Low confidence",
    description: "The extraction was unsure about these.",
    match: (obligation) => obligation.confidence < 0.6,
  },
  {
    key: "unverified",
    label: "Source needs checking",
    description: "We could not match these to a passage in your document.",
    match: (obligation) => obligation.sourceStatus === "unverified",
  },
  {
    key: "conflicts",
    label: "Has conflicting dates",
    description: "The document states more than one date for these.",
    match: (obligation) => obligation.dateConflicts.length > 1,
  },
  {
    key: "confirmed",
    label: "Confirmed",
    description: "You have signed off on these.",
    match: (obligation) => obligation.reviewStatus === "confirmed",
  },
];

const BULK_ELIGIBLE = (obligation: ObligationWithCitations): boolean =>
  obligation.reviewStatus === "needs_review" &&
  obligation.sourceStatus === "verified" &&
  obligation.confidence >= 0.75 &&
  obligation.dateConflicts.length === 0;

/** Bands where the extraction is not confident enough to stay quiet about it. */
const CONFIDENCE_ATTENTION = 0.6;

function useIsDesktop(): boolean {
  // Assume desktop for the first paint; only event handlers read this, so the
  // server and client markup can never disagree.
  const [isDesktop, setIsDesktop] = React.useState(true);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function ReviewWorkspace({
  award,
  obligations,
  segments,
  progress,
  documentName = null,
  pageCount = null,
}: ReviewWorkspaceProps) {
  const isDesktop = useIsDesktop();

  const active = React.useMemo(
    () => obligations.filter((obligation) => obligation.reviewStatus !== "archived"),
    [obligations],
  );

  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [activeCitationId, setActiveCitationId] = React.useState<string | null>(null);
  const [editorTargetId, setEditorTargetId] = React.useState<string | null>(null);
  /**
   * The last obligation the editor was opened for, kept after it closes.
   *
   * Rendering the editor on `editorTargetId` alone unmounted the whole subtree
   * in the same commit that set `open` to false, so Radix's focus scope was
   * destroyed before it could restore focus and the caret fell to <body>. This
   * keeps the dialog mounted through its close, and `restoreFocusTo` then puts
   * focus back on the queue row the user came from.
   *
   * Set only when opening — never cleared — so it survives the close.
   */
  const [lastEditorTargetId, setLastEditorTargetId] = React.useState<string | null>(null);

  const openEditor = React.useCallback((obligationId: string) => {
    setEditorTargetId(obligationId);
    setLastEditorTargetId(obligationId);
  }, []);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);
  // Kept after the dialog closes, for the same reason as `lastEditorTargetId`:
  // `onCloseAutoFocus` runs once the id has already been cleared.
  const [lastDeleteTargetId, setLastDeleteTargetId] = React.useState<string | null>(null);

  const openDeleteDialog = React.useCallback((obligationId: string) => {
    setDeleteTargetId(obligationId);
    setLastDeleteTargetId(obligationId);
  }, []);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [sourceDrawerOpen, setSourceDrawerOpen] = React.useState(false);
  const [legendOpen, setLegendOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const queue = React.useMemo(() => {
    const definition = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
    return active.filter(definition.match);
  }, [active, filter]);

  // Selection is derived rather than synced, so a filter change or a refreshed
  // list can never leave a stale item highlighted.
  const selected = React.useMemo(
    () => queue.find((obligation) => obligation.id === selectedId) ?? queue[0] ?? null,
    [queue, selectedId],
  );

  const activeCitation = React.useMemo<ObligationCitation | null>(() => {
    if (!selected) return null;
    const cited = selected.citations.filter((citation) => citation.documentSegmentId);
    return cited.find((citation) => citation.id === activeCitationId) ?? cited[0] ?? null;
  }, [selected, activeCitationId]);

  const editorTarget = React.useMemo(
    () => obligations.find((obligation) => obligation.id === editorTargetId) ?? null,
    [obligations, editorTargetId],
  );
  const deleteTarget = React.useMemo(
    () => obligations.find((obligation) => obligation.id === deleteTargetId) ?? null,
    [obligations, deleteTargetId],
  );

  // Falls back to the last edited obligation so the dialog stays mounted while
  // it closes; see the note on `lastEditorTargetId`.
  const editorObligation = React.useMemo(
    () =>
      editorTarget ??
      obligations.find((obligation) => obligation.id === lastEditorTargetId) ??
      null,
    [editorTarget, obligations, lastEditorTargetId],
  );

  const bulkEligible = React.useMemo(() => active.filter(BULK_ELIGIBLE), [active]);
  const outstanding = React.useMemo(
    () => active.filter((obligation) => obligation.reviewStatus === "needs_review"),
    [active],
  );
  const bulkSkipped = outstanding.length - bulkEligible.length;

  const reviewed = progress.confirmed + progress.notApplicable + progress.needsClarification;
  const queueFinished = active.length > 0 && outstanding.length === 0;

  const itemRefs = React.useRef(new Map<string, HTMLElement>());
  // Focus fallback for when the row a dialog was opened from no longer exists
  // — after a delete, for instance. Never let focus land on <body>.
  const queueRef = React.useRef<HTMLOListElement | null>(null);
  const moveSourceRef = React.useRef<"keyboard" | "pointer" | null>(null);
  const anyDialogOpen =
    editorTargetId !== null || deleteTargetId !== null || bulkOpen || sourceDrawerOpen;

  const setItemRef = React.useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) itemRefs.current.set(id, node);
      else itemRefs.current.delete(id);
    },
    [],
  );

  const focusRow = React.useCallback((obligationId: string | null) => {
    const node = obligationId ? itemRefs.current.get(obligationId) : null;
    if (node) {
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
      return;
    }
    // Never leave focus on <body>; the queue itself is always a valid landing.
    queueRef.current?.focus({ preventScroll: true });
  }, []);

  /**
   * Returns focus when a dialog closes with no server round trip — Escape,
   * Cancel, an overlay click.
   *
   * This MUST be called from Radix's `onCloseAutoFocus`, not from
   * `onOpenChange`. `onOpenChange` fires when Radix decides to close, before
   * the focus scope tears down; `FocusScope` restores focus in its unmount
   * cleanup afterwards, so anything focused in `onOpenChange` is immediately
   * overwritten and focus lands on <body>. `onCloseAutoFocus` is the point
   * Radix is about to move focus itself, which is exactly where we want to take
   * over — so the handler also calls `preventDefault()`.
   */
  const restoreFocusTo = React.useCallback(
    (obligationId: string | null) => {
      focusRow(obligationId);
    },
    [focusRow],
  );

  const handleCloseAutoFocus = React.useCallback(
    (obligationId: string | null) => (event: Event) => {
      event.preventDefault();
      restoreFocusTo(obligationId);
    },
    [restoreFocusTo],
  );

  /**
   * Returns focus after an action that revalidates the route.
   *
   * A deferred focus does NOT work here, and this is worth being precise about
   * because the obvious fix is wrong: focusing on the next animation frame
   * races the server round trip plus the router refresh. When the frame wins,
   * we focus a row node that the refresh then discards, the browser drops focus
   * to <body>, and nothing puts it back — the selection effect only focuses on
   * keyboard-originated moves. Measured, that race lost roughly one time in six,
   * and settling took anywhere from 400ms to 3s.
   *
   * So this is render-driven rather than time-driven: the intent is recorded
   * here and consumed by an effect keyed on the obligation list, which by
   * definition runs on the render that has the post-refresh data. No timing
   * assumption, no matter how the refresh is scheduled.
   */
  const pendingFocusRef = React.useRef<{ id: string | null } | null>(null);

  const focusAfterRefresh = React.useCallback((obligationId: string | null) => {
    pendingFocusRef.current = { id: obligationId };
  }, []);

  React.useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus) return;
    pendingFocusRef.current = null;
    focusRow(pendingFocus.id);
  }, [obligations, focusRow]);

  const selectedKey = selected?.id ?? null;
  React.useEffect(() => {
    const origin = moveSourceRef.current;
    moveSourceRef.current = null;
    if (!origin || !selectedKey) return;
    const node = itemRefs.current.get(selectedKey);
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
    if (origin === "keyboard") node.focus({ preventScroll: true });
  }, [selectedKey]);

  const select = React.useCallback((id: string, origin: "keyboard" | "pointer") => {
    moveSourceRef.current = origin;
    setSelectedId(id);
  }, []);

  const move = React.useCallback(
    (delta: number) => {
      if (queue.length === 0) return;
      const current = selected ? queue.findIndex((item) => item.id === selected.id) : -1;
      const next = Math.min(Math.max(current + delta, 0), queue.length - 1);
      const target = queue[next];
      if (target) select(target.id, "keyboard");
    },
    [queue, selected, select],
  );

  /**
   * Moves to the next item still awaiting a decision. The item just acted on is
   * excluded explicitly, because the refreshed list has not arrived yet.
   */
  const advanceFrom = React.useCallback(
    (id: string) => {
      const index = queue.findIndex((item) => item.id === id);
      const isOpen = (item: ObligationWithCitations) =>
        item.id !== id && item.reviewStatus === "needs_review";
      const next =
        queue.slice(index + 1).find(isOpen) ?? queue.slice(0, Math.max(index, 0)).find(isOpen);
      if (next) select(next.id, "pointer");
      // Returned so a caller closing a dialog programmatically knows where
      // focus should land.
      return next?.id ?? null;
    },
    [queue, select],
  );

  const setStatus = React.useCallback(
    (obligation: ObligationWithCitations, status: ReviewStatus, successMessage: string) => {
      if (pending) return;
      const formData = new FormData();
      formData.set("obligationId", obligation.id);
      formData.set("reviewStatus", status);
      setPendingId(obligation.id);

      startTransition(async () => {
        const result = await setReviewStatusAction(formData);
        setPendingId(null);
        if (!result.ok) {
          toast.error(result.message ?? "Something went wrong");
          return;
        }
        toast.success(successMessage);
        advanceFrom(obligation.id);
      });
    },
    [advanceFrom, pending],
  );

  const confirmSelected = React.useCallback(() => {
    if (!selected) return;
    setStatus(selected, "confirmed", "Confirmed.");
  }, [selected, setStatus]);

  const openSource = React.useCallback(
    (citation: ObligationCitation) => {
      setActiveCitationId(citation.id);
      if (!isDesktop) setSourceDrawerOpen(true);
    },
    [isDesktop],
  );

  /* --------------------------------------------------------- shortcuts -- */

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (anyDialogOpen) return;

      // Never steal a keystroke from something the user is typing into.
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest("[contenteditable='true']")
        ) {
          return;
        }
      }

      if (event.key === "?") {
        event.preventDefault();
        setLegendOpen((open) => !open);
        return;
      }
      if (event.key === "Escape" && legendOpen) {
        setLegendOpen(false);
        return;
      }
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === "c") {
        event.preventDefault();
        confirmSelected();
        return;
      }
      if (event.key === "e" && selected) {
        event.preventDefault();
        openEditor(selected.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyDialogOpen, confirmSelected, legendOpen, move, openEditor, selected]);

  /* ------------------------------------------------------------ actions -- */

  function handleDelete(id: string) {
    if (pending) return;
    const formData = new FormData();
    formData.set("obligationId", id);
    setPendingId(id);

    startTransition(async () => {
      const result = await deleteObligationAction(formData);
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.message ?? "Something went wrong");
        return;
      }
      toast.success("Deleted.");
      setDeleteTargetId(null);
      const nextId = advanceFrom(id);

      // Radix only calls onOpenChange when the USER closes a dialog — Escape,
      // an overlay click, a DialogClose. Closing it programmatically here flips
      // `open` without that ever firing, so nothing restores focus by itself.
      //
      // This is also the case with the least margin for error: the row the user
      // came from has just been deleted, so there is nothing to return to, and
      // a route revalidation is in flight. Hand it to the render-driven path so
      // focus lands on whichever render arrives last.
      focusAfterRefresh(nextId);
    });
  }

  function handleBulkConfirm() {
    if (pending) return;
    const formData = new FormData();
    formData.set("awardId", award.id);

    startTransition(async () => {
      const result = await bulkConfirmAction(formData);
      if (!result.ok) {
        toast.error(result.message ?? "Something went wrong");
        return;
      }
      toast.success(result.message ?? "Confirmed.");
      setBulkOpen(false);
    });
  }

  /* ------------------------------------------------------------- render -- */

  const sourcePanel = (
    <SourcePanel
      segments={segments}
      activeCitation={activeCitation}
      documentName={documentName}
      pageCount={pageCount}
      className="h-full"
    />
  );

  return (
    <div className="container-page pb-2 pt-5">
      <Link
        href={`/app/awards/${award.id}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to {award.name}
      </Link>

      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="type-title">Review what this award requires</h1>
          <p className="type-small mt-1.5 max-w-[58ch] text-muted-foreground">
            Work through one item at a time with the document beside it. Nothing counts as agreed
            until you say so.
          </p>
        </div>

        <div className="cluster shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 sm:h-9"
            aria-expanded={legendOpen}
            aria-controls="review-shortcut-legend"
            onClick={() => setLegendOpen((open) => !open)}
          >
            <Keyboard className="size-4" aria-hidden="true" />
            Shortcuts
          </Button>

          {outstanding.length > 0 ? (
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-11 sm:h-9">
                  <CheckCheck className="size-4" aria-hidden="true" />
                  Confirm all verified items
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm the items we could verify</DialogTitle>
                  <DialogDescription>
                    This is deliberately narrow. It only confirms items AwardLens matched to a
                    passage in your document with high confidence.
                  </DialogDescription>
                </DialogHeader>

                <div className="stack-sm text-sm">
                  <div className="rounded-md border border-border-subtle bg-surface-sunken px-3.5 py-3">
                    <p className="font-medium text-foreground">
                      It will confirm {bulkEligible.length}{" "}
                      {bulkEligible.length === 1 ? "item" : "items"}
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-foreground-soft">
                      <li>· the source was verified against your document</li>
                      <li>· extraction confidence is 75% or higher</li>
                      <li>· the document gives only one date for it</li>
                    </ul>
                  </div>

                  <div className="rounded-md border border-warning-border bg-warning-subtle px-3.5 py-3">
                    <p className="flex items-center gap-1.5 font-medium text-warning">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                      It will not touch {bulkSkipped} {bulkSkipped === 1 ? "item" : "items"}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-warning">
                      Anything with an unverified source, low confidence or conflicting dates stays
                      as it is. Those are exactly the items that need your eyes, so you will still
                      have to read them one by one.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 sm:h-10"
                    onClick={() => setBulkOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="h-11 sm:h-10"
                    onClick={handleBulkConfirm}
                    disabled={pending || bulkEligible.length === 0}
                  >
                    {pending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        Confirming…
                      </>
                    ) : (
                      `Confirm ${bulkEligible.length} ${bulkEligible.length === 1 ? "item" : "items"}`
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {legendOpen ? (
        <div
          id="review-shortcut-legend"
          className="mt-3 rounded-lg border border-border-subtle bg-surface-sunken px-4 py-3"
        >
          <h2 className="eyebrow text-muted-foreground">Keyboard shortcuts</h2>
          <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            <ShortcutRow keys={["j", "↓"]} label="Next item" />
            <ShortcutRow keys={["k", "↑"]} label="Previous item" />
            <ShortcutRow keys={["c"]} label="Confirm the open item" />
            <ShortcutRow keys={["e"]} label="Edit the open item" />
            <ShortcutRow keys={["?"]} label="Show or hide this list" />
          </dl>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Shortcuts are ignored while you are typing in a field or a dialog is open.
          </p>
        </div>
      ) : null}

      {active.length === 0 ? (
        <NothingToReview awardId={award.id} />
      ) : (
        /*
         * The workspace proper. One fixed-height row at `lg`, so the document
         * and the queue scroll inside themselves instead of the page scrolling
         * a sticky column past several hundred pixels of empty background.
         */
        /*
         * The height is not arbitrary. Below the workspace sit the page's own
         * bottom padding, the app layout's `pb-16` and the footer — about
         * 11rem. Scrolled to the bottom, a workspace of `100dvh - 14rem` comes
         * to rest just under the sticky header instead of tucking its top edge
         * behind it, at every viewport height, because the offset above it
         * cancels out.
         */
        <div className="mt-4 print:block! print:h-auto! lg:grid lg:h-[calc(100dvh-14rem)] lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.03fr)] lg:gap-5">
          {/* ------------------------------------------------ source pane -- */}
          <div className="hidden min-h-0 lg:block">{sourcePanel}</div>

          {/* ------------------------------------------------------ queue -- */}
          <div className="flex min-w-0 flex-col lg:min-h-0">
            {/* ------------------------------------------------- progress -- */}
            <div className="shrink-0 rounded-lg border border-border bg-surface px-4 py-3 shadow-resting">
              <div className="flex items-center gap-3">
                <p className="eyebrow shrink-0 text-muted-foreground">Review progress</p>
                <Progress
                  className="min-w-16 flex-1"
                  value={progress.percentComplete}
                  aria-label={`Review ${progress.percentComplete} percent complete`}
                />
                <p className="tabular shrink-0 font-mono text-xs font-medium text-foreground-soft">
                  {progress.percentComplete}%
                </p>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-muted-foreground" aria-live="polite">
                {progress.total === 0
                  ? "Nothing to review yet."
                  : `${reviewed} of ${progress.total} reviewed · ${outstanding.length} still waiting on you · ${progress.confirmed} confirmed · ${progress.notApplicable} not applicable`}
              </p>
            </div>

            <div className="mt-3 shrink-0 lg:hidden">
              <Dialog open={sourceDrawerOpen} onOpenChange={setSourceDrawerOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="secondary" className="h-11 w-full">
                    <BookOpen className="size-4" aria-hidden="true" />
                    Open the source document
                  </Button>
                </DialogTrigger>
                <SheetContent side="bottom" className="h-[85vh] p-0">
                  <DialogHeader className="sr-only">
                    <DialogTitle>Source document</DialogTitle>
                    <DialogDescription>
                      The stored text of your award, with the cited passage marked.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 p-3 pt-10">{sourcePanel}</div>
                </SheetContent>
              </Dialog>
            </div>

            {/* -------------------------------------------------- filters -- */}
            <h2 className="sr-only">Filter the review queue</h2>
            <div className="mt-3 flex shrink-0 flex-wrap gap-1.5">
              {FILTERS.map((definition) => {
                const count = active.filter(definition.match).length;
                const isActive = filter === definition.key;
                return (
                  <button
                    key={definition.key}
                    type="button"
                    aria-pressed={isActive}
                    title={definition.description}
                    onClick={() => setFilter(definition.key)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium transition-colors sm:min-h-7",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : // --border-control is 3.18:1 on white, which is what
                          // WCAG 1.4.11 asks of a control boundary; the old
                          // --border-strong managed 1.64:1.
                          "border-border-control bg-surface text-foreground-soft hover:border-foreground-soft hover:bg-muted",
                    )}
                  >
                    {definition.label}
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 py-0.5 font-mono text-[11px]",
                        isActive ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ---------------------------------------------------- queue -- */}
            {/* `print:` overrides so a printed page is not clipped to one
                viewport's worth of queue; the register and the plan are the
                real print artefacts, but this must not silently lose rows. */}
            <div className="mt-3 print:overflow-visible! lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-1 lg:pb-1">
              {queueFinished ? <CompletionState award={award} progress={progress} /> : null}

              {queue.length === 0 ? (
                <EmptyState
                  headingLevel={3}
                  className="h-full"
                  title="No items match this filter"
                  description={
                    <>
                      Choose <strong className="font-medium text-foreground">All</strong> to see
                      everything on this award.
                    </>
                  }
                />
              ) : (
                <ol
                  ref={queueRef}
                  tabIndex={-1}
                  className="space-y-1.5"
                  aria-label="Obligations awaiting review"
                >
                  {queue.map((obligation, index) => {
                    const isSelected = selected?.id === obligation.id;
                    const isPending = pendingId === obligation.id && pending;

                    if (!isSelected) {
                      return (
                        <QueueRow
                          key={obligation.id}
                          obligation={obligation}
                          index={index}
                          rowRef={setItemRef(obligation.id)}
                          onSelect={() => select(obligation.id, "pointer")}
                        />
                      );
                    }

                    const citations = obligation.citations.filter(
                      (citation) => citation.documentSegmentId,
                    );

                    return (
                      <li key={obligation.id} className="py-1.5 first:pt-0">
                        <div
                          ref={setItemRef(obligation.id)}
                          tabIndex={-1}
                          role="group"
                          aria-label={`Reviewing item ${index + 1} of ${queue.length}: ${obligation.title}`}
                          className="scroll-mt-20 rounded-lg lg:scroll-mt-2"
                        >
                          <EvidenceRail
                            obligation={obligation}
                            selected
                            actions={
                              <>
                                {/* Confirm is the action. Everything else on
                                    this row is an escape from it, so the ladder
                                    runs primary → muted → ghost and the two
                                    record-keeping controls sit apart on the
                                    right. Nothing is hidden. */}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="primary"
                                  className="h-11 px-4 sm:h-9"
                                  disabled={pending}
                                  onClick={() => setStatus(obligation, "confirmed", "Confirmed.")}
                                >
                                  {isPending ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Check className="size-4" aria-hidden="true" />
                                  )}
                                  Confirm
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="muted"
                                  className="h-11 sm:h-9"
                                  disabled={pending}
                                  onClick={() =>
                                    setStatus(
                                      obligation,
                                      "needs_clarification",
                                      "Flagged for clarification.",
                                    )
                                  }
                                >
                                  <MessageCircleQuestion className="size-4" aria-hidden="true" />
                                  Needs clarification
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="muted"
                                  className="h-11 sm:h-9"
                                  disabled={pending}
                                  onClick={() =>
                                    setStatus(
                                      obligation,
                                      "not_applicable",
                                      "Marked not applicable.",
                                    )
                                  }
                                >
                                  <Ban className="size-4" aria-hidden="true" />
                                  Not applicable
                                </Button>

                                {/* Below the rule: everything that is not a
                                    decision. Checking the passage in context
                                    sits at the left, next to the evidence it
                                    belongs to; editing and deleting the record
                                    are pushed to the far end. */}
                                <span className="rule flex w-full flex-wrap items-center gap-1 pt-2">
                                  {citations.map((citation) => (
                                    <Button
                                      key={citation.id}
                                      type="button"
                                      size="sm"
                                      variant={
                                        activeCitation?.id === citation.id ? "subtle" : "ghost"
                                      }
                                      className="h-11 sm:h-8"
                                      aria-pressed={activeCitation?.id === citation.id}
                                      onClick={() => openSource(citation)}
                                    >
                                      <Quote className="size-4" aria-hidden="true" />
                                      Open source ·{" "}
                                      {formatLocator(citation.locatorType, citation.locatorValue)}
                                    </Button>
                                  ))}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-11 sm:ml-auto sm:h-8"
                                    disabled={pending}
                                    onClick={() => openEditor(obligation.id)}
                                  >
                                    <Pencil className="size-4" aria-hidden="true" />
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructiveGhost"
                                    className="h-11 sm:h-8"
                                    disabled={pending}
                                    onClick={() => openDeleteDialog(obligation.id)}
                                  >
                                    <Trash2 className="size-4" aria-hidden="true" />
                                    Delete
                                  </Button>
                                </span>
                              </>
                            }
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        Both dialogs below are opened programmatically (from the `e` shortcut
        and from row actions), so there is no `DialogTrigger` for Radix to
        restore focus to when they close. Left alone, focus falls to <body> —
        and on this screen in particular that is punishing: it is the one
        surface built for keyboard-driven work, and a user who pressed `e` on
        item nine would have to tab back through the header, the filters and
        every earlier row to resume.

        So we return focus to the queue row the dialog was opened from, which
        is where the user actually was. `restoreFocusTo` runs after the close
        completes, and the editor is kept mounted (its own `open` prop drives
        it) so Radix's focus scope is not unmounted mid-flight.
      */}
      {editorObligation ? (
        <ObligationEditor
          key={editorObligation.id}
          obligation={editorObligation}
          open={editorTargetId !== null}
          onOpenChange={(open) => {
            if (open) return;
            setEditorTargetId(null);
            // Save also revalidates the route, so re-apply focus once the
            // refreshed list renders. `onCloseAutoFocus` below covers the
            // Escape and Cancel paths, where no re-render is coming.
            focusAfterRefresh(lastEditorTargetId);
          }}
          onCloseAutoFocus={handleCloseAutoFocus(lastEditorTargetId)}
        />
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (open) return;
          setDeleteTargetId(null);
        }}
      >
        {/*
          Cancelling returns to the row. Confirming is handled separately in
          `handleDelete`, which knows the row is gone and hands the next one to
          the render-driven path.
        */}
        <DialogContent onCloseAutoFocus={handleCloseAutoFocus(lastDeleteTargetId)}>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              This removes the item and its source citation from your register. Your uploaded
              document is untouched. If the item is real but does not apply to you, mark it
              &ldquo;Not applicable&rdquo; instead — that keeps the record of why.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget ? (
            <p className="rounded-md border border-border-subtle bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-foreground">
              {deleteTarget.title}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="h-11 sm:h-10"
              onClick={() => setDeleteTargetId(null)}
              disabled={pending}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 sm:h-10"
              disabled={pending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id);
              }}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                "Delete permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------- pieces ---- */

/**
 * A collapsed queue row.
 *
 * Everything ordinary about the row is spent as cheaply as it can be: the
 * status is plain text at the end of the metadata run, and the rail on the left
 * edge stays transparent until somebody has actually decided something. What
 * gets a filled pill is only what would change how you read the item —
 * an unverified source, two dates in the document, critical priority, or an
 * extraction the model was unsure of.
 */
function QueueRow({
  obligation,
  index,
  rowRef,
  onSelect,
}: {
  obligation: ObligationWithCitations;
  index: number;
  rowRef: (node: HTMLElement | null) => void;
  onSelect: () => void;
}) {
  const status = obligation.reviewStatus;
  const undecided = status === "needs_review";

  const rail =
    status === "confirmed"
      ? "bg-success"
      : status === "needs_clarification"
        ? "bg-warning"
        : status === "not_applicable" || status === "archived"
          ? "bg-border-strong"
          : obligation.sourceStatus === "unverified"
            ? "bg-destructive"
            : "bg-transparent";

  const flags: React.ReactNode[] = [];
  if (obligation.sourceStatus !== "verified") {
    flags.push(<SourceStatusBadge key="source" status={obligation.sourceStatus} />);
  }
  if (obligation.dateConflicts.length > 1) {
    flags.push(
      <Badge key="conflict" variant="warning" emphasis="solid" size="xs">
        <AlertTriangle aria-hidden="true" />
        Conflicting dates
      </Badge>,
    );
  }
  if (obligation.priority === "critical") {
    flags.push(
      <Badge key="priority" variant="destructive" emphasis="solid" size="xs">
        Critical priority
      </Badge>,
    );
  }
  if (obligation.origin !== "manual" && obligation.confidence < CONFIDENCE_ATTENTION) {
    flags.push(
      <ConfidenceBadge key="confidence" confidence={obligation.confidence} emphasis="solid" />,
    );
  }

  return (
    <li>
      <button
        type="button"
        ref={rowRef}
        onClick={onSelect}
        className={cn(
          "relative flex w-full scroll-mt-20 items-start gap-3 overflow-hidden rounded-md border",
          "border-border-subtle bg-surface py-2.5 pl-4 pr-3 text-left",
          "transition-colors hover:border-border hover:bg-muted lg:scroll-mt-2",
        )}
      >
        <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", rail)} />
        <span
          className="tabular mt-px w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm leading-snug",
              undecided ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {obligation.title}
          </span>
          <span className="meta-row mt-0.5 text-xs text-muted-foreground">
            <span>{CATEGORY_META[obligation.category].label}</span>
            <span>
              {obligation.dueDate
                ? `Due ${formatIsoDate(obligation.dueDate, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}`
                : "No stated due date"}
            </span>
            {/*
              Wrapped for two reasons: the badge's own ::before marker would
              otherwise collide with the separator `.meta-row` draws on each
              child, and the wrapper is where the ordinary case gets demoted —
              "Needs review" is the state every row starts in, so it reads as
              the last item of the metadata run rather than as a label.
            */}
            <span
              className={cn(
                undecided && "[&>span]:font-normal [&>span]:text-muted-foreground",
              )}
            >
              <ReviewStatusBadge status={status} emphasis={undecided ? "bare" : undefined} />
            </span>
          </span>
        </span>
        {flags.length > 0 ? (
          <span className="cluster-tight shrink-0 justify-end pt-px">{flags}</span>
        ) : null}
      </button>
    </li>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </dt>
      <dd className="text-muted-foreground">{label}</dd>
    </div>
  );
}

function NothingToReview({ awardId }: { awardId: string }) {
  return (
    <Card className="mt-6" elevation="resting">
      <CardHeader padding="roomy">
        <CardTitle>There is nothing to review on this award</CardTitle>
        <CardDescription>
          No obligations were extracted from the documents attached to this award.
        </CardDescription>
      </CardHeader>
      <CardContent padding="roomy" className="stack-md text-sm leading-relaxed text-foreground-soft">
        <p className="measure-wide">
          That usually means one of two things: the document had no readable text layer, or it
          genuinely does not state any requirements. Neither is a guarantee that you have no
          obligations — read the award yourself before you rely on this being empty.
        </p>
        <Button asChild variant="secondary" className="h-11 sm:h-10">
          <Link href={`/app/awards/${awardId}`}>Back to the award</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CompletionState({ award, progress }: { award: Award; progress: ReviewProgress }) {
  return (
    <div className="mb-3 rounded-lg border border-success-border bg-success-subtle px-4 py-3.5">
      <h3 className="type-subhead flex items-center gap-2 text-foreground">
        <CheckCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        Every item has been through a person
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-foreground-soft">
        You confirmed {progress.confirmed} {progress.confirmed === 1 ? "item" : "items"} and marked{" "}
        {progress.notApplicable} as not applicable
        {progress.needsClarification > 0
          ? `, with ${progress.needsClarification} still waiting on an answer from the funder`
          : ""}
        . {progress.unverifiedSource > 0
          ? `${progress.unverifiedSource} of them could not be matched to a passage in your document, so check those against the award itself.`
          : "Every confirmed item is traceable back to a passage in your document."}
      </p>
      <div className="cluster mt-3">
        <Button asChild variant="primary" size="sm" className="h-11 sm:h-9">
          <Link href={`/app/awards/${award.id}`}>Go to the award workspace</Link>
        </Button>
        <Button asChild variant="secondary" size="sm" className="h-11 sm:h-9">
          <a href={`/api/awards/${award.id}/export/csv`} download>
            <Download className="size-4" aria-hidden="true" />
            Export as CSV
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm" className="h-11 sm:h-9">
          <a href={`/api/awards/${award.id}/export/ics`} download>
            <Download className="size-4" aria-hidden="true" />
            Add deadlines to a calendar
          </a>
        </Button>
      </div>
    </div>
  );
}
