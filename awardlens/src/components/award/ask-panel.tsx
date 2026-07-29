"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldHint, Label, Textarea } from "@/components/ui/field";
import { Kbd } from "@/components/ui/misc";
import { askAwardAction } from "@/app/actions/ask";
import { SUGGESTED_QUESTIONS } from "@/lib/ai/suggested-questions";

/**
 * A research panel, not a chat window. There is no typing animation, no
 * assistant persona and no illusion of conversation — you ask a question of a
 * document and get a cited answer or an honest "not addressed".
 *
 * The form is the one raised object on the page: everything else here is either
 * an answer that already exists or a way of starting one.
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
      <Card elevation="raised">
        <CardContent className="pt-5">
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" disabled={pending || question.trim().length < 5}>
                <Search className="size-4" aria-hidden="true" />
                {pending ? "Searching the document…" : "Ask"}
              </Button>
              <p aria-hidden="true" className="type-caption font-normal text-muted-foreground">
                <Kbd>Enter</Kbd> to ask · <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> for a new line
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-7">
        <h2 className="eyebrow text-muted-foreground">Suggested questions</h2>
        <ul className="cluster-tight mt-2.5">
          {SUGGESTED_QUESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <Button
                type="button"
                variant="muted"
                size="sm"
                /* h-auto + whitespace-normal: a suggestion is a sentence, and
                   at 390px it has to be allowed to wrap rather than push the
                   page sideways. */
                className="h-auto whitespace-normal rounded-full py-1.5 text-left font-normal"
                disabled={pending}
                onClick={() => {
                  setQuestion(suggestion);
                  textareaRef.current?.focus();
                }}
              >
                {suggestion}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
