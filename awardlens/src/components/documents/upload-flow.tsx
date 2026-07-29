"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, FileText, Loader2, Lock, Upload } from "lucide-react";

import { Button, ButtonRow } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/navigation";
import { PROCESSING_STAGE_LABELS, PROCESSING_STAGES, type ProcessingStage } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface IngestEvent {
  type: "stage" | "done" | "error";
  stage?: ProcessingStage;
  awardId?: string;
  duplicate?: boolean;
  obligationCount?: number;
  warnings?: string[];
  code?: string;
  message?: string;
}

type Phase = "idle" | "working" | "failed";

const ACCEPT = ".pdf,.docx,.txt,.md";

export function UploadFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [completedStages, setCompletedStages] = useState<ProcessingStage[]>([]);
  const [currentStage, setCurrentStage] = useState<ProcessingStage | null>(null);
  const [error, setError] = useState<{ message: string; awardId?: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (body: FormData) => {
      setPhase("working");
      setError(null);
      setCompletedStages([]);
      setCurrentStage(null);

      try {
        const response = await fetch("/api/awards/ingest", { method: "POST", body });

        if (!response.ok && !response.body) {
          const payload = (await response.json().catch(() => null)) as IngestEvent | null;
          setError({ message: payload?.message ?? "The upload was rejected." });
          setPhase("failed");
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setError({ message: "The server response could not be read." });
          setPhase("failed");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        // Newline-delimited JSON: each complete line is one real stage transition.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            const raw = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!raw) continue;

            let event: IngestEvent;
            try {
              event = JSON.parse(raw) as IngestEvent;
            } catch {
              continue;
            }

            if (event.type === "stage" && event.stage) {
              const stage = event.stage;
              setCurrentStage((previous) => {
                if (previous) setCompletedStages((done) => [...done, previous]);
                return stage;
              });
            } else if (event.type === "done" && event.awardId) {
              setCurrentStage(null);
              setCompletedStages([...PROCESSING_STAGES]);
              const target = event.duplicate
                ? `/app/awards/${event.awardId}?duplicate=1`
                : `/app/awards/${event.awardId}/review?fresh=1`;
              router.push(target);
              return;
            } else if (event.type === "error") {
              setError({ message: event.message ?? "Processing failed.", awardId: event.awardId });
              setPhase("failed");
              return;
            }
          }
        }

        // The stream ended without a terminal event.
        setError({
          message: "The connection closed before analysis finished. Please try again.",
        });
        setPhase("failed");
      } catch {
        setError({
          message:
            "We lost the connection while analysing this document. Your document was not lost — please try again.",
        });
        setPhase("failed");
      }
    },
    [router],
  );

  if (phase === "working") {
    return <ProcessingPanel completed={completedStages} current={currentStage} />;
  }

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      {error ? (
        <Alert
          variant="destructive"
          className="mb-5"
          icon={<CircleAlert aria-hidden="true" />}
        >
          <AlertTitle>We could not analyse that document</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            {error.awardId ? (
              <Button asChild size="sm" variant="secondary" className="mt-3">
                <a href={`/app/awards/${error.awardId}`}>Open the award anyway</a>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
       * The one raised object on the page. Handing over a grant agreement is the
       * moment this product asks for the most trust, so the thing you hand it to
       * should read as a single considered surface — a sunken band of tabs on
       * top, the work in the middle, and the privacy promise closing it off at
       * the bottom, where it is still on screen on a phone.
       */}
      <Card elevation="raised" className="overflow-hidden">
        {/* The tabs are the section's navigation, not its heading. */}
        <h2 className="sr-only">Provide the award document</h2>

        <Tabs defaultValue="file">
          {/*
           * `[&_[role=tab]]:after:bottom-0` is not decoration — it is the only
           * reason the active tab has an underline at all. TabsList is
           * `overflow-x-auto` so a narrow phone can scroll the row, and any
           * overflow other than `visible` clips its children: the trigger's
           * underline sits at `bottom: -1px`, so exactly half of the 2px rule
           * was being cut off and the surviving half landed on the list's own
           * hairline. Pulling the rule fully inside the trigger puts all 2px of
           * evergreen back on screen, in the same place it was aiming for.
           */}
          <TabsList
            aria-label="How to provide the award document"
            className="bg-surface-sunken px-1 [&_[role=tab]]:after:bottom-0 sm:px-3"
          >
            <TabsTrigger value="file">Upload a file</TabsTrigger>
            <TabsTrigger value="paste">Paste text</TabsTrigger>
            <TabsTrigger value="sample">Use a sample</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="p-5 sm:p-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                if (file) data.set("file", file);
                if (!data.get("file")) return;
                void submit(data);
              }}
              className="stack-lg"
            >
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) setFile(dropped);
                }}
                className={cn(
                  "rounded-lg border p-5 transition-colors sm:p-6",
                  dragging
                    ? "border-primary bg-primary-subtle"
                    : file
                      ? "border-border bg-surface"
                      : "border-dashed border-border-strong bg-surface-sunken/60",
                )}
              >
                {/*
                  Visually hidden rather than `hidden`, because `display: none`
                  breaks the programmatic `.click()` below in some browsers. That
                  keeps it in the accessibility tree and the tab order, so it
                  needs a real label of its own — the visible "Choose a file"
                  button is a separate element and does not name this input.
                */}
                <label htmlFor="award-file" className="sr-only">
                  Award document file (PDF, DOCX, TXT or Markdown, up to 15 MB)
                </label>
                <input
                  ref={inputRef}
                  id="award-file"
                  type="file"
                  name="file"
                  accept={ACCEPT}
                  className="sr-only"
                  aria-describedby="award-file-hint"
                  onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
                />

                {/*
                 * Dropping a file onto the page fires no native announcement at
                 * all, so the one state change a person cannot see is the one
                 * that most needs saying. Present from first render so the
                 * region is live by the time it has something to say.
                 */}
                <p role="status" className="sr-only">
                  {file ? `${file.name} selected` : ""}
                </p>

                {file ? (
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary-border bg-primary-subtle text-primary [&>svg]:size-[18px]"
                      >
                        <FileText />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                        <p className="meta-row type-caption mt-0.5 text-muted-foreground">
                          <span>{fileKind(file.name)}</span>
                          <span className="tabular">{formatSize(file.size)}</span>
                        </p>
                      </div>
                    </div>
                    <ButtonRow className="mt-3.5 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => inputRef.current?.click()}
                      >
                        Choose a different file
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                        Remove
                      </Button>
                    </ButtonRow>
                  </div>
                ) : (
                  <div className="text-center">
                    <span
                      aria-hidden="true"
                      className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-foreground-soft shadow-resting [&>svg]:size-5"
                    >
                      <FileText />
                    </span>
                    <p className="type-body mt-3.5 font-medium text-foreground">
                      Drag your award document here
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => inputRef.current?.click()}
                    >
                      <Upload aria-hidden="true" />
                      Choose a file
                    </Button>
                  </div>
                )}
              </div>

              {/*
               * The file rules, told once.
               *
               * This used to be two things: a centred format line inside the
               * dropzone and, directly beneath it, a bordered Alert about
               * scans. Same subject, two weights, and the caveat carried the
               * visual mass of a form field while sitting between the page's
               * only two inputs. Both statements now hang under the control
               * they govern, at the weight the award-name field uses for its
               * own hint — the caveat keeps its ink (--foreground-soft, 10.55:1)
               * and its size, and only loses a border it never needed.
               *
               * `aria-describedby` on the file input points at this id, so it
               * is rendered unconditionally. Outside the filled/empty branch
               * the reference cannot dangle, and a screen reader now hears the
               * scan caveat while focused on the input it applies to. It is a
               * description, not an announcement, so it is deliberately not a
               * live region and carries no role.
               */}
              {/* mt-4, not the stack's 24px: the hint belongs to the box above
                  it, not to the field below it. A utility replaces `.stack-lg`'s
                  margin outright rather than adding to it. */}
              <div id="award-file-hint" className="mt-4">
                {/* Both lines at 13px. Setting the spec smaller than the caveat
                    inverts the scale — the exception would out-size the rule. */}
                <p className="pl-[22px] text-[13px] leading-relaxed text-muted-foreground">
                  Text-based PDF, DOCX, TXT or Markdown · up to 15 MB
                </p>
                <p className="mt-1 flex gap-2 text-[13px] leading-relaxed text-foreground-soft">
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-[3px] size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>
                    Scanned documents and photos of documents are not supported yet — AwardLens
                    needs a real text layer. If your PDF is a scan, paste the text instead.
                  </span>
                </p>
              </div>

              <AwardNameField />

              <SubmitRow
                hint={
                  file ? "Analysis usually takes under a minute." : "Choose a document to continue."
                }
              >
                {/*
                 * A disabled evergreen slab at 50% opacity reads as broken. This
                 * one goes grey instead — at full opacity, so it reads as a
                 * control that is waiting rather than one that has failed.
                 */}
                <Button
                  type="submit"
                  size="lg"
                  disabled={!file}
                  className="w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:w-auto"
                >
                  Analyse this award
                </Button>
              </SubmitRow>
            </form>
          </TabsContent>

          <TabsContent value="paste" className="p-5 sm:p-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(new FormData(event.currentTarget));
              }}
              className="stack-lg"
            >
              <Field>
                <Label htmlFor="award-text">Award document text</Label>
                <Textarea
                  id="award-text"
                  name="text"
                  required
                  rows={12}
                  placeholder="Paste the full text of the grant agreement or award letter…"
                  className="bg-paper font-mono text-[13px] text-ink-document"
                />
                <FieldHint>
                  Paste everything, including exhibits and attachments. More context means better
                  citations.
                </FieldHint>
              </Field>

              <AwardNameField />

              <SubmitRow hint="Analysis usually takes under a minute.">
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  Analyse this award
                </Button>
              </SubmitRow>
            </form>
          </TabsContent>

          <TabsContent value="sample" className="p-5 sm:p-6">
            <h3 className="type-subhead text-foreground">
              Sample: foundation general operating grant
            </h3>
            <p className="type-small measure mt-2 text-muted-foreground">
              A synthetic five-page grant agreement. Nothing in it refers to a real organisation —
              use it to see exactly what AwardLens produces before uploading anything of your own.
            </p>

            <p className="eyebrow mt-5 text-muted-foreground">What is in it</p>
            <ul className="stack-xs mt-2.5 text-[13px] leading-relaxed text-foreground-soft">
              {[
                "Reporting deadlines",
                "A restriction on how funds may be used",
                "An acknowledgement requirement",
                "A closeout obligation",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    /* A 4px dot centres on a 13px/1.625 line box at 0.66em; it
                       sits a whisker above that so it reads with the x-height
                       rather than the descenders. */
                    className="mt-[0.64em] size-1 shrink-0 rounded-full bg-border-control"
                  />
                  {item}
                </li>
              ))}
            </ul>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData();
                data.set("sample", "true");
                data.set("awardName", "Sample foundation grant");
                void submit(data);
              }}
            >
              <SubmitRow hint="The sample becomes a real award in your account, and counts towards your plan.">
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  Analyse the sample
                </Button>
              </SubmitRow>
            </form>
          </TabsContent>
        </Tabs>

        {/*
         * The short form of the privacy promise, closing the card. The full
         * four-point version lives beside the form on a wide screen and below it
         * on a phone; this line is what someone reads with their thumb over the
         * submit button.
         */}
        <div className="flex items-start gap-2.5 border-t border-border bg-surface-sunken px-5 py-3.5 sm:px-6">
          <Lock className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {/* muted-foreground on --surface-sunken: 5.34:1 */}
          <p className="type-caption text-muted-foreground">
            Private to your organisation. Never used to train a model. Delete it at any time.
          </p>
        </div>
      </Card>
    </div>
  );
}

/**
 * The bottom of every form in the card: a hairline, the one primary action, and
 * a line saying what the button is waiting for. Full width on a phone, where
 * thumbs are the input device; intrinsic width above that, where a 660px green
 * slab reads as a banner rather than a button.
 */
function SubmitRow({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <div className="rule mt-5 pt-4">
      {children}
      <p className="type-caption mt-2.5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function AwardNameField() {
  return (
    <Field>
      <Label htmlFor="award-name">Award name (optional)</Label>
      <Input
        id="award-name"
        name="awardName"
        maxLength={120}
        placeholder="e.g. Whitfield Foundation — general operating 2026"
      />
      <FieldHint>Leave blank and we&rsquo;ll use the name from the document.</FieldHint>
    </Field>
  );
}

/** The extension, when it is one we accept; otherwise a neutral word. */
function fileKind(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot === -1 ? "" : name.slice(dot + 1).toUpperCase();
  return ["PDF", "DOCX", "TXT", "MD"].includes(extension) ? extension : "Document";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * What each stage is actually doing, in the reader's terms.
 *
 * Taken from `src/lib/awards/process.ts` rather than invented: the first stage
 * really does fingerprint the bytes before storing them, and the fifth really
 * does match every extracted item back to a stored segment. Saying so is the
 * point — this is the one minute in the product where a person is asked to wait
 * while software reads a document they are nervous about.
 *
 * All six are rendered from the start and never change, so the `aria-live`
 * region only ever announces the thing that did change: the stage name and its
 * state.
 */
const STAGE_DETAIL: Record<ProcessingStage, string> = {
  securing_document: "Fingerprinted, then stored in private storage.",
  reading_document: "Extracting the text layer, page by page.",
  identifying_award: "Funder, award number, amount and period.",
  finding_obligations: "Deadlines, reports, restrictions and deliverables.",
  checking_sources: "Matching each item to the sentence it came from.",
  preparing_review: "Everything arrives unconfirmed, waiting for you.",
};

function ProcessingPanel({
  completed,
  current,
}: {
  completed: ProcessingStage[];
  current: ProcessingStage | null;
}) {
  const done = new Set(completed);
  const total = PROCESSING_STAGES.length;
  const finished = Math.min(done.size, total);

  return (
    <Card elevation="raised" className="overflow-hidden">
      <div className="p-5 sm:p-7">
        <h2 className="type-heading text-foreground">Analysing your award</h2>
        <p className="type-small mt-1.5 text-muted-foreground">
          This usually takes under a minute. Keep this tab open.
        </p>

        {/*
         * Outside the live region on purpose: the checklist below already
         * announces every transition, and a progress bar that also spoke would
         * say the same thing twice.
         */}
        <div className="mt-5">
          <Progress
            value={(finished / total) * 100}
            aria-label="Analysis progress"
            className="h-1"
          />
          <p className="type-caption tabular mt-2 text-muted-foreground">
            {finished} of {total} steps complete
          </p>
        </div>

        <ol className="mt-6" aria-live="polite">
          {PROCESSING_STAGES.map((stage, index) => {
            const isDone = done.has(stage);
            const isCurrent = current === stage;
            const isLast = index === total - 1;

            return (
              <li key={stage} className={cn("relative flex gap-3.5", !isLast && "pb-5")}>
                {/* The rail joins one step to the next and fills in as it goes. */}
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-1 left-[10px] top-6 w-px",
                      isDone ? "bg-primary/40" : "bg-border",
                    )}
                  />
                ) : null}

                <span
                  className={cn(
                    "relative flex size-[21px] shrink-0 items-center justify-center rounded-full border",
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border-primary bg-surface text-primary"
                        : "border-border bg-surface text-transparent",
                  )}
                  aria-hidden="true"
                >
                  {isDone ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : isCurrent ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-border-strong" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      isCurrent
                        ? "font-medium text-foreground"
                        : isDone
                          ? "text-foreground-soft"
                          : "text-muted-foreground",
                    )}
                  >
                    {PROCESSING_STAGE_LABELS[stage]}
                    {isCurrent ? <span className="sr-only"> — in progress</span> : null}
                    {isDone ? <span className="sr-only"> — complete</span> : null}
                  </p>
                  <p className="type-caption mt-0.5 text-muted-foreground">
                    {STAGE_DETAIL[stage]}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-start gap-2.5 border-t border-border bg-surface-sunken px-5 py-3.5 sm:px-7">
        <Check className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
        {/* muted-foreground on --surface-sunken: 5.34:1 */}
        <p className="type-caption text-muted-foreground">
          Nothing AwardLens finds is treated as final. Every item arrives unconfirmed and stays that
          way until you confirm it yourself.
        </p>
      </div>
    </Card>
  );
}
