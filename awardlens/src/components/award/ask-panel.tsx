"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldHint, Label, Textarea } from "@/components/ui/field";
import { askAwardAction } from "@/app/actions/ask";
import { SUGGESTED_QUESTIONS } from "@/lib/ai/suggested-questions";

/**
 * A research panel, not a chat window. There is no typing animation, no
 * assistant persona and no illusion of conversation — you ask a question of a
 * document and get a cited answer or an honest "not addressed".
 */
export function AskPanel({ awardId }: { awardId: string }) {
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 5) {
      toast.error("Ask a slightly longer question.");
      return;
    }

    const formData = new FormData();
    formData.set("awardId", awardId);
    formData.set("question", trimmed);

    startTransition(async () => {
      const result = await askAwardAction(formData);
      if (result.ok) {
        setQuestion("");
      } else {
        toast.error(result.message ?? "That question could not be answered.");
      }
    });
  };

  return (
    <div className="mt-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
      >
        <Field>
          <Label htmlFor="ask-question">Your question</Label>
          <Textarea
            id="ask-question"
            ref={textareaRef}
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            onKeyDown={(event) => {
              // Enter submits; Shift+Enter adds a newline.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(question);
              }
            }}
            rows={3}
            maxLength={400}
            disabled={pending}
            placeholder="e.g. Does this award require prior approval before we move money between budget lines?"
          />
          <FieldHint>
            Answered only from this award&rsquo;s documents. Press Enter to ask.
          </FieldHint>
        </Field>

        <Button type="submit" className="mt-3" disabled={pending || question.trim().length < 5}>
          <Search className="size-4" aria-hidden="true" />
          {pending ? "Searching the document…" : "Ask"}
        </Button>
      </form>

      <div className="mt-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested questions
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setQuestion(suggestion);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground-soft transition-colors hover:border-border-strong hover:bg-muted disabled:opacity-50"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
