"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateObligationAction } from "@/app/actions/obligations";
import {
  CATEGORY_META,
  OBLIGATION_CATEGORIES,
  OBLIGATION_PRIORITIES,
  PRIORITY_LABELS,
  type Obligation,
  type ObligationCategory,
  type ObligationPriority,
} from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldHint,
  FieldRow,
  Input,
  Label,
  NativeSelect,
  Textarea,
} from "@/components/ui/field";

/**
 * The obligation editor.
 *
 * Editing is how a person takes ownership of a machine-written item. The one
 * thing that must never happen is losing the provenance in the process, so the
 * dialog states plainly that the original citation stays attached.
 */

interface ObligationEditorProps {
  obligation: Obligation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save, so the queue can move on. */
  onSaved?: () => void;
  /**
   * Radix's own hook for "the dialog is closing and is about to move focus".
   * Callers that opened this dialog programmatically have no trigger for Radix
   * to restore to, so they pass this to place focus themselves. It is the only
   * point that reliably runs *after* the focus scope tears down.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

interface EditorFields {
  title: string;
  description: string;
  category: ObligationCategory;
  priority: ObligationPriority;
  dueDate: string;
  internalDueDate: string;
  recurrence: string;
  suggestedOwnerRole: string;
  notes: string;
}

type FieldErrors = Partial<Record<keyof EditorFields, string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Section legends, set as eyebrows.
 *
 * `FieldGroup` sets a legend in `.type-subhead` — the same step `DialogTitle`
 * uses — and two headings at one size is not a hierarchy. Dropping them to the
 * eyebrow treatment (the system's only small-caps label) puts them clearly
 * above the field labels and clearly below the dialog title, which is what
 * gives the form a spine.
 */
const GROUP = [
  "[&>legend]:mb-2.5 [&>legend]:text-[11px] [&>legend]:font-semibold [&>legend]:uppercase",
  "[&>legend]:leading-[1.3] [&>legend]:tracking-[0.085em] [&>legend]:text-muted-foreground",
].join(" ");

function initialFields(obligation: Obligation): EditorFields {
  return {
    title: obligation.title,
    description: obligation.description,
    category: obligation.category,
    priority: obligation.priority,
    dueDate: obligation.dueDate ?? "",
    internalDueDate: obligation.internalDueDate ?? "",
    recurrence: obligation.recurrence ?? "",
    suggestedOwnerRole: obligation.suggestedOwnerRole ?? "",
    notes: obligation.notes ?? "",
  };
}

/** Mirrors the server's schema so the user is told before a round trip. */
function validate(fields: EditorFields): FieldErrors {
  const errors: FieldErrors = {};
  const title = fields.title.trim();
  const description = fields.description.trim();

  if (title.length < 3) errors.title = "Give this item a title of at least 3 characters.";
  else if (title.length > 160) errors.title = "Keep the title to 160 characters or fewer.";

  if (description.length < 3) {
    errors.description = "Describe what has to happen, in at least 3 characters.";
  } else if (description.length > 2000) {
    errors.description = "Keep the description to 2,000 characters or fewer.";
  }

  if (fields.dueDate && !ISO_DATE.test(fields.dueDate)) {
    errors.dueDate = "Enter a date in the format YYYY-MM-DD.";
  }
  if (fields.internalDueDate && !ISO_DATE.test(fields.internalDueDate)) {
    errors.internalDueDate = "Enter a date in the format YYYY-MM-DD.";
  }
  if (fields.recurrence.trim().length > 80) {
    errors.recurrence = "Keep this to 80 characters or fewer.";
  }
  if (fields.suggestedOwnerRole.trim().length > 80) {
    errors.suggestedOwnerRole = "Keep this to 80 characters or fewer.";
  }
  if (fields.notes.trim().length > 2000) {
    errors.notes = "Keep your note to 2,000 characters or fewer.";
  }

  return errors;
}

export function ObligationEditor({
  obligation,
  open,
  onOpenChange,
  onSaved,
  onCloseAutoFocus,
}: ObligationEditorProps) {
  const [fields, setFields] = React.useState<EditorFields>(() => initialFields(obligation));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  /*
   * Reopening always shows what is currently saved, never a half-typed draft.
   * Reset during render rather than in an effect so the dialog never paints one
   * frame of stale values.
   */
  const openFor = open ? obligation.id : null;
  const [resetFor, setResetFor] = React.useState<string | null>(openFor);
  if (resetFor !== openFor) {
    setResetFor(openFor);
    if (openFor !== null) {
      setFields(initialFields(obligation));
      setErrors({});
      setFormError(null);
    }
  }

  const set = React.useCallback(<K extends keyof EditorFields>(key: K, value: EditorFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }, []);

  const isMachineWritten = obligation.origin !== "manual";
  const titleId = `obligation-editor-${obligation.id}`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const found = validate(fields);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFormError("Some details still need fixing before this can be saved.");
      return;
    }

    setErrors({});
    setFormError(null);

    const formData = new FormData();
    formData.set("obligationId", obligation.id);
    formData.set("title", fields.title.trim());
    formData.set("description", fields.description.trim());
    formData.set("category", fields.category);
    formData.set("priority", fields.priority);
    formData.set("dueDate", fields.dueDate);
    formData.set("internalDueDate", fields.internalDueDate);
    formData.set("recurrence", fields.recurrence.trim());
    formData.set("suggestedOwnerRole", fields.suggestedOwnerRole.trim());
    formData.set("notes", fields.notes.trim());

    startTransition(async () => {
      const result = await updateObligationAction(formData);
      if (!result.ok) {
        setFormError(result.message ?? "Something went wrong");
        return;
      }
      toast.success("Saved. This item is now yours.");
      onOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        A spine, rather than one long scrolling box. The dialog is a fixed
        frame — title at the top, actions pinned at the bottom — and only the
        middle moves. Inside it the fields are four named groups, each a real
        `fieldset` with a `legend`, so the order of the form is legible both to
        the eye and to a screen reader instead of being eleven controls in a
        column.
      */}
      <DialogContent
        className="flex max-w-2xl flex-col overflow-y-hidden"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Edit this requirement</DialogTitle>
          <DialogDescription>
            Change the wording, the dates or the category so this item matches what your
            organisation actually has to do.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogBody className="flex flex-col gap-5 py-px">
            {isMachineWritten ? (
              /*
                Provenance, not magic. This used to carry a sparkle icon, which
                is exactly the wrong claim for a product whose whole argument is
                that a machine drafted something and a person has to own it.
              */
              <p className="flex gap-2.5 rounded-md border border-ink-accent-border bg-ink-accent-subtle px-3.5 py-3 text-xs leading-relaxed text-foreground-soft">
                <FileText className="mt-px size-3.5 shrink-0 text-ink-accent" aria-hidden="true" />
                <span>
                  AwardLens drafted this item from your document. Once you edit it, it is recorded
                  as yours rather than as machine output — and the original source citation stays
                  attached, so you can still see exactly where it came from.
                </span>
              </p>
            ) : null}

            <FieldError>{formError}</FieldError>

            <FieldGroup legend="What this requires" className={GROUP}>
              <Field>
                <Label htmlFor={`${titleId}-title-input`}>Title</Label>
                <Input
                  id={`${titleId}-title-input`}
                  name="title"
                  value={fields.title}
                  onChange={(event) => set("title", event.target.value)}
                  maxLength={160}
                  required
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? `${titleId}-title-error` : undefined}
                />
                <FieldError id={`${titleId}-title-error`}>{errors.title}</FieldError>
              </Field>

              <Field>
                <Label htmlFor={`${titleId}-description`}>What has to happen</Label>
                <Textarea
                  id={`${titleId}-description`}
                  name="description"
                  rows={4}
                  value={fields.description}
                  onChange={(event) => set("description", event.target.value)}
                  maxLength={2000}
                  required
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={errors.description ? `${titleId}-description-error` : undefined}
                />
                <FieldError id={`${titleId}-description-error`}>{errors.description}</FieldError>
              </Field>
            </FieldGroup>

            <div className="rule pt-5">
              <FieldGroup legend="How it is filed" className={GROUP}>
                <FieldRow>
                  <Field>
                    <Label htmlFor={`${titleId}-category`}>Category</Label>
                    <NativeSelect
                      id={`${titleId}-category`}
                      name="category"
                      value={fields.category}
                      onChange={(event) => set("category", event.target.value as ObligationCategory)}
                    >
                      {OBLIGATION_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {CATEGORY_META[category].label}
                        </option>
                      ))}
                    </NativeSelect>
                    <FieldHint>{CATEGORY_META[fields.category].description}</FieldHint>
                  </Field>

                  <Field>
                    <Label htmlFor={`${titleId}-priority`}>Priority</Label>
                    <NativeSelect
                      id={`${titleId}-priority`}
                      name="priority"
                      value={fields.priority}
                      onChange={(event) => set("priority", event.target.value as ObligationPriority)}
                    >
                      {OBLIGATION_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </NativeSelect>
                    <FieldHint>Drives how early reminders start.</FieldHint>
                  </Field>
                </FieldRow>
              </FieldGroup>
            </div>

            <div className="rule pt-5">
              <FieldGroup legend="Timing" className={GROUP}>
                <FieldRow>
                  <Field>
                    <Label htmlFor={`${titleId}-due-date`}>Due date</Label>
                    <Input
                      id={`${titleId}-due-date`}
                      name="dueDate"
                      type="date"
                      value={fields.dueDate}
                      onChange={(event) => set("dueDate", event.target.value)}
                      aria-invalid={errors.dueDate ? true : undefined}
                      aria-describedby={`${titleId}-due-date-hint`}
                    />
                    <FieldHint id={`${titleId}-due-date-hint`}>
                      {obligation.originalDateText
                        ? `The document says: “${obligation.originalDateText}”`
                        : "Leave empty if the award does not give a date."}
                    </FieldHint>
                    <FieldError>{errors.dueDate}</FieldError>
                  </Field>

                  <Field>
                    <Label htmlFor={`${titleId}-internal-date`}>Start work by</Label>
                    <Input
                      id={`${titleId}-internal-date`}
                      name="internalDueDate"
                      type="date"
                      value={fields.internalDueDate}
                      onChange={(event) => set("internalDueDate", event.target.value)}
                      aria-invalid={errors.internalDueDate ? true : undefined}
                      aria-describedby={`${titleId}-internal-date-hint`}
                    />
                    <FieldHint id={`${titleId}-internal-date-hint`}>
                      Your own internal date. Left empty, AwardLens works one out from the due date.
                    </FieldHint>
                    <FieldError>{errors.internalDueDate}</FieldError>
                  </Field>
                </FieldRow>

                <FieldRow>
                  <Field>
                    <Label htmlFor={`${titleId}-recurrence`}>Repeats</Label>
                    <Input
                      id={`${titleId}-recurrence`}
                      name="recurrence"
                      value={fields.recurrence}
                      onChange={(event) => set("recurrence", event.target.value)}
                      maxLength={80}
                      placeholder="e.g. quarterly"
                      aria-invalid={errors.recurrence ? true : undefined}
                    />
                    <FieldError>{errors.recurrence}</FieldError>
                  </Field>
                </FieldRow>
              </FieldGroup>
            </div>

            <div className="rule pt-5">
              <FieldGroup legend="Ownership and notes" className={GROUP}>
                <FieldRow>
                  <Field>
                    <Label htmlFor={`${titleId}-owner`}>Suggested owner</Label>
                    <Input
                      id={`${titleId}-owner`}
                      name="suggestedOwnerRole"
                      value={fields.suggestedOwnerRole}
                      onChange={(event) => set("suggestedOwnerRole", event.target.value)}
                      maxLength={80}
                      placeholder="e.g. Finance Director"
                      aria-invalid={errors.suggestedOwnerRole ? true : undefined}
                    />
                    <FieldError>{errors.suggestedOwnerRole}</FieldError>
                  </Field>
                </FieldRow>

                <Field>
                  <Label htmlFor={`${titleId}-notes`}>Your notes</Label>
                  <Textarea
                    id={`${titleId}-notes`}
                    name="notes"
                    rows={3}
                    value={fields.notes}
                    onChange={(event) => set("notes", event.target.value)}
                    maxLength={2000}
                    aria-invalid={errors.notes ? true : undefined}
                  />
                  <FieldHint>
                    Anything your team needs to know — who you spoke to, what you agreed, what is
                    still open.
                  </FieldHint>
                  <FieldError>{errors.notes}</FieldError>
                </Field>
              </FieldGroup>
            </div>
          </DialogBody>

          <DialogFooter className="rule pt-4">
            <Button
              type="button"
              variant="secondary"
              className="h-11 sm:h-10"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="h-11 sm:h-10" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
