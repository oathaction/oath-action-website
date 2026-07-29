"use client";

import * as React from "react";
import Link from "next/link";
import {
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
  EvidenceRail,
  ReviewStatusBadge,
  SourceStatusBadge,
} from "@/components/evidence/evidence-rail";
import { ObligationEditor } from "@/components/obligations/obligation-editor";
import { SourcePanel } from "@/components/documents/source-panel";
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
import { Progress } from "@/components/ui/misc";

/**
 * The review workspace — the screen the whole product exists to serve.
 *
 * A person works one obligation at a time with the document open beside it.
 * Nothing here confirms itself: every status change is a deliberate act, bulk
 * confirmation is restricted to items whose source we actually verified, and
 * deletion always asks first.
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

  /**
   * Returns focus to a queue row after a programmatically opened dialog closes.
   *
   * Deferred to the next frame because Radix is still tearing down its focus
   * scope in the same commit; focusing synchronously would be immediately
   * overwritten. Falls back to the queue container so focus can never end up on
   * <body>, which would strand a keyboard user at the top of the document.
   */
  const restoreFocusTo = React.useCallback((obligationId: string | null) => {
    requestAnimationFrame(() => {
      const node = obligationId ? itemRefs.current.get(obligationId) : null;
      if (node) {
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: "nearest" });
        return;
      }
      queueRef.current?.focus({ preventScroll: true });
    });
  }, []);

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
      // `open` without that ever firing, so the restore wired into
      // onOpenChange does not run and focus falls to <body>.
      //
      // This is also the case with the least margin for error: the row the user
      // came from has just been deleted, so there is nothing to return to.
      // Focus moves to the next item the queue advanced to, and falls back to
      // the queue list when that was the last one.
      restoreFocusTo(nextId);
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
    <div className="container-page pt-6">
      <Link
        href={`/app/awards/${award.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {award.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Review what this award requires</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Work through one item at a time with the document beside it. Nothing counts as agreed
            until you say so.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 sm:h-8"
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
                <Button type="button" variant="secondary" size="sm" className="h-11 sm:h-8">
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

                <div className="space-y-3 text-sm">
                  <div className="rounded-md border border-border bg-surface-sunken p-3">
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

                  <div className="rounded-md border border-warning-border bg-warning-subtle p-3">
                    <p className="font-medium text-warning">
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
          className="mt-4 rounded-lg border border-border bg-surface-sunken px-4 py-3"
        >
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <ShortcutRow keys={["j", "↓"]} label="Next item" />
            <ShortcutRow keys={["k", "↑"]} label="Previous item" />
            <ShortcutRow keys={["c"]} label="Confirm the open item" />
            <ShortcutRow keys={["e"]} label="Edit the open item" />
            <ShortcutRow keys={["?"]} label="Show or hide this list" />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Shortcuts are ignored while you are typing in a field or a dialog is open.
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------- progress -- */}
      <div className="mt-5 rounded-lg border border-border bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-foreground">Review progress</p>
          <p className="tabular font-mono text-xs text-muted-foreground">
            {progress.percentComplete}%
          </p>
        </div>
        <Progress
          className="mt-2"
          value={progress.percentComplete}
          aria-label={`Review ${progress.percentComplete} percent complete`}
        />
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {progress.total === 0
            ? "Nothing to review yet."
            : `${reviewed} of ${progress.total} reviewed · ${outstanding.length} still waiting on you · ${progress.confirmed} confirmed · ${progress.notApplicable} not applicable`}
        </p>
      </div>

      {active.length === 0 ? (
        <EmptyState awardId={award.id} />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* ------------------------------------------------ source pane -- */}
          <div className="hidden lg:block">
            <div className="sticky top-20 h-[calc(100dvh-7rem)]">{sourcePanel}</div>
          </div>

          {/* ------------------------------------------------------ queue -- */}
          <div className="min-w-0">
            <div className="lg:hidden">
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

            <div className="mt-4 lg:mt-0">
              <h2 className="sr-only">Filter the review queue</h2>
              <div className="flex flex-wrap gap-2">
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
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors sm:min-h-0",
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-surface text-foreground-soft hover:bg-muted",
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
            </div>

            {queueFinished ? (
              <CompletionState award={award} progress={progress} />
            ) : null}

            {queue.length === 0 ? (
              <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
                No items match this filter. Choose <strong className="font-medium">All</strong> to
                see everything on this award.
              </p>
            ) : (
              <ol
                ref={queueRef}
                tabIndex={-1}
                className="mt-5 space-y-2.5"
                aria-label="Obligations awaiting review"
              >
                {queue.map((obligation, index) => {
                  const isSelected = selected?.id === obligation.id;
                  const isPending = pendingId === obligation.id && pending;

                  if (!isSelected) {
                    return (
                      <li key={obligation.id}>
                        <button
                          type="button"
                          ref={setItemRef(obligation.id)}
                          onClick={() => select(obligation.id, "pointer")}
                          className="flex w-full scroll-mt-20 items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-muted"
                        >
                          <span
                            className="tabular mt-0.5 shrink-0 font-mono text-xs text-muted-foreground"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-snug text-foreground">
                              {obligation.title}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span>{CATEGORY_META[obligation.category].label}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {obligation.dueDate
                                  ? `Due ${formatIsoDate(obligation.dueDate, {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })}`
                                  : "No stated due date"}
                              </span>
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <ReviewStatusBadge status={obligation.reviewStatus} />
                            {obligation.sourceStatus !== "verified" ? (
                              <SourceStatusBadge status={obligation.sourceStatus} />
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  }

                  const citations = obligation.citations.filter(
                    (citation) => citation.documentSegmentId,
                  );

                  return (
                    <li key={obligation.id}>
                      <div
                        ref={setItemRef(obligation.id)}
                        tabIndex={-1}
                        role="group"
                        aria-label={`Reviewing item ${index + 1} of ${queue.length}: ${obligation.title}`}
                        className="scroll-mt-20 rounded-lg ring-2 ring-primary/25"
                      >
                        <EvidenceRail
                          obligation={obligation}
                          actions={
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="primary"
                                className="h-11 sm:h-8"
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
                                variant="secondary"
                                className="h-11 sm:h-8"
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
                                variant="secondary"
                                className="h-11 sm:h-8"
                                disabled={pending}
                                onClick={() =>
                                  setStatus(obligation, "not_applicable", "Marked not applicable.")
                                }
                              >
                                <Ban className="size-4" aria-hidden="true" />
                                Not applicable
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-11 sm:h-8"
                                disabled={pending}
                                onClick={() => openEditor(obligation.id)}
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-11 text-destructive hover:bg-destructive-subtle hover:text-destructive sm:h-8"
                                disabled={pending}
                                onClick={() => setDeleteTargetId(obligation.id)}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                                Delete
                              </Button>

                              {citations.length > 0 ? (
                                <span className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2.5">
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
                                </span>
                              ) : null}
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
            const returnTo = editorTargetId;
            setEditorTargetId(null);
            restoreFocusTo(returnTo);
          }}
        />
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (open) return;
          const returnTo = deleteTargetId;
          setDeleteTargetId(null);
          restoreFocusTo(returnTo);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              This removes the item and its source citation from your register. Your uploaded
              document is untouched. If the item is real but does not apply to you, mark it
              &ldquo;Not applicable&rdquo; instead — that keeps the record of why.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget ? (
            <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm font-medium text-foreground">
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

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="rounded border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground-soft"
          >
            {key}
          </kbd>
        ))}
      </dt>
      <dd className="text-muted-foreground">{label}</dd>
    </div>
  );
}

function EmptyState({ awardId }: { awardId: string }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>There is nothing to review on this award</CardTitle>
        <CardDescription>
          No obligations were extracted from the documents attached to this award.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-foreground-soft">
        <p>
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
    <Card className="mt-5 border-success-subtle bg-success-subtle/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCheck className="size-5 text-success" aria-hidden="true" />
          Every item has been through a person
        </CardTitle>
        <CardDescription className="text-foreground-soft">
          You confirmed {progress.confirmed} {progress.confirmed === 1 ? "item" : "items"} and
          marked {progress.notApplicable} as not applicable
          {progress.needsClarification > 0
            ? `, with ${progress.needsClarification} still waiting on an answer from the funder`
            : ""}
          . {progress.unverifiedSource > 0
            ? `${progress.unverifiedSource} of them could not be matched to a passage in your document, so check those against the award itself.`
            : "Every confirmed item is traceable back to a passage in your document."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild variant="primary" className="h-11 sm:h-10">
          <Link href={`/app/awards/${award.id}`}>Go to the award workspace</Link>
        </Button>
        <Button asChild variant="secondary" className="h-11 sm:h-10">
          <a href={`/api/awards/${award.id}/export/csv`} download>
            <Download className="size-4" aria-hidden="true" />
            Export as CSV
          </a>
        </Button>
        <Button asChild variant="secondary" className="h-11 sm:h-10">
          <a href={`/api/awards/${award.id}/export/ics`} download>
            <Download className="size-4" aria-hidden="true" />
            Add deadlines to a calendar
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
