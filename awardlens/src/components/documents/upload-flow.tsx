"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, FileText, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

  return (
    <div className="mt-6">
      {error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle className="flex items-center gap-2">
            <CircleAlert className="size-4" aria-hidden="true" />
            We could not analyse that document
          </AlertTitle>
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

      <Tabs defaultValue="file">
        <TabsList aria-label="How to provide the award document">
          <TabsTrigger value="file">Upload a file</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
          <TabsTrigger value="sample">Use a sample</TabsTrigger>
        </TabsList>

        <TabsContent value="file">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (file) data.set("file", file);
              if (!data.get("file")) return;
              void submit(data);
            }}
            className="space-y-4"
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
                "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                dragging ? "border-primary bg-primary-subtle" : "border-border-strong bg-surface",
              )}
            >
              <FileText className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">
                {file ? file.name : "Drag your award document here"}
              </p>
              <p id="award-file-hint" className="mt-1 text-xs text-muted-foreground">
                Text-based PDF, DOCX, TXT or Markdown · up to 15 MB
              </p>

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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-4" aria-hidden="true" />
                Choose a file
              </Button>
              {file ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} KB selected ·{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                  >
                    remove
                  </button>
                </p>
              ) : null}
            </div>

            <AwardNameField />

            <Alert variant="info">
              <AlertDescription className="text-xs leading-relaxed">
                Scanned documents and photos of documents are not supported yet — AwardLens needs a
                real text layer. If your PDF is a scan, paste the text instead.
              </AlertDescription>
            </Alert>

            <Button type="submit" size="lg" className="w-full" disabled={!file}>
              Analyse this award
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="paste">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(new FormData(event.currentTarget));
            }}
            className="space-y-4"
          >
            <Field>
              <Label htmlFor="award-text">Award document text</Label>
              <Textarea
                id="award-text"
                name="text"
                required
                rows={12}
                placeholder="Paste the full text of the grant agreement or award letter…"
                className="font-mono text-[13px]"
              />
              <FieldHint>
                Paste everything, including exhibits and attachments. More context means better
                citations.
              </FieldHint>
            </Field>

            <AwardNameField />

            <Button type="submit" size="lg" className="w-full">
              Analyse this award
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="sample">
          <div className="rounded-lg border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">Sample: foundation general operating grant</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A synthetic five-page grant agreement with reporting deadlines, a restriction on
              fund use, an acknowledgement requirement and a closeout obligation. Nothing in it
              refers to a real organisation. Use it to see exactly what AwardLens produces before
              uploading anything of your own.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData();
                data.set("sample", "true");
                data.set("awardName", "Sample foundation grant");
                void submit(data);
              }}
            >
              <Button type="submit" size="lg" variant="secondary" className="mt-4 w-full">
                Analyse the sample
              </Button>
            </form>
          </div>
        </TabsContent>
      </Tabs>
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

function ProcessingPanel({
  completed,
  current,
}: {
  completed: ProcessingStage[];
  current: ProcessingStage | null;
}) {
  const done = new Set(completed);

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">Analysing your award</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This usually takes under a minute. Keep this tab open.
      </p>

      <ol className="mt-5 space-y-3" aria-live="polite">
        {PROCESSING_STAGES.map((stage) => {
          const isDone = done.has(stage);
          const isCurrent = current === stage;
          return (
            <li key={stage} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary text-primary"
                      : "border-border text-transparent",
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
              <span
                className={cn(
                  "text-sm",
                  isDone
                    ? "text-muted-foreground line-through decoration-border"
                    : isCurrent
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {PROCESSING_STAGE_LABELS[stage]}
                {isCurrent ? <span className="sr-only"> — in progress</span> : null}
                {isDone ? <span className="sr-only"> — complete</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
