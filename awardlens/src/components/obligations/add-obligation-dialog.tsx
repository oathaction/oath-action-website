"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { addObligationAction } from "@/app/actions/obligations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_META,
  OBLIGATION_CATEGORIES,
  OBLIGATION_PRIORITIES,
  PRIORITY_LABELS,
  type CategoryGroup,
  type ObligationCategory,
} from "@/lib/domain/types";

/** Section legends set as eyebrows — see the note in `obligation-editor.tsx`. */
const GROUP = [
  "[&>legend]:mb-2.5 [&>legend]:text-[11px] [&>legend]:font-semibold [&>legend]:uppercase",
  "[&>legend]:leading-[1.3] [&>legend]:tracking-[0.085em] [&>legend]:text-muted-foreground",
].join(" ");

const GROUP_ORDER: CategoryGroup[] = ["deadlines", "money", "programmatic", "compliance"];

function categoriesByGroup(): { group: CategoryGroup; categories: ObligationCategory[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    categories: OBLIGATION_CATEGORIES.filter((category) => CATEGORY_META[category].group === group),
  })).filter((entry) => entry.categories.length > 0);
}

/**
 * Adding an obligation by hand.
 *
 * The register exists to separate "the award says this" from "we think this".
 * An item typed in here is neither — it is the user's own record — so the dialog
 * says plainly how it will be stored: confirmed, user-entered, no citation.
 */
export function AddObligationDialog({ awardId }: { awardId: string }) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await addObligationAction(formData);
      if (result.ok) {
        toast.success("Added to the register as a confirmed, user-entered item.");
        formRef.current?.reset();
        setOpen(false);
        return;
      }
      const message = result.message ?? "That could not be saved.";
      setError(message);
      toast.error(message);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-8">
          <Plus className="size-4" aria-hidden="true" />
          Add an obligation
        </Button>
      </DialogTrigger>

      {/*
        Same spine as the editor: a fixed frame with the actions pinned, and the
        fields grouped into named `fieldset`s rather than run together in one
        scrolling column.
      */}
      <DialogContent
        aria-describedby={`${fieldId}-intro`}
        className="flex max-w-2xl flex-col overflow-y-hidden"
      >
        <DialogHeader>
          <DialogTitle>Add an obligation</DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <input type="hidden" name="awardId" value={awardId} />

          {/*
            The description scrolls with the form — see the note in
            `obligation-editor.tsx`. Pinned above a phone-sized dialog it and
            the recording note together left one visible field.
          */}
          <DialogBody className="flex flex-col gap-5 py-px">
            <DialogDescription id={`${fieldId}-intro`}>
              Use this for a requirement you know about that the document does not state — an
              internal deadline, a funder instruction given by email, a commitment made in the
              application.
            </DialogDescription>

            {/*
              How a hand-entered item is stored is the whole point of the
              register, so it is stated up front and in the accent tone the rest
              of the product uses for provenance — not buried in a hint under
              the last field.
            */}
            <p className="rounded-md border border-ink-accent-border bg-ink-accent-subtle px-3.5 py-3 text-xs leading-relaxed text-foreground-soft">
              <span className="font-semibold">How this will be recorded.</span> An obligation you
              add yourself is stored as <span className="font-semibold">confirmed</span> and{" "}
              <span className="font-semibold">entered by you</span>, with no source citation,
              because there is no passage in the document to point at. That keeps it permanently
              distinguishable from anything AwardLens extracted from the award, in the register and
              in every export.
            </p>

            <FieldGroup legend="What this requires" className={GROUP}>
              <Field>
                <Label htmlFor={`${fieldId}-title`}>Title</Label>
                <Input
                  id={`${fieldId}-title`}
                  name="title"
                  required
                  minLength={3}
                  maxLength={160}
                  autoComplete="off"
                  placeholder="e.g. Send the funder a mid-year budget variance note"
                />
                <FieldHint>A short, recognisable name. 3 to 160 characters.</FieldHint>
              </Field>

              <Field>
                <Label htmlFor={`${fieldId}-description`}>What has to happen</Label>
                <Textarea
                  id={`${fieldId}-description`}
                  name="description"
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe the requirement in enough detail that a colleague could act on it without asking you."
                />
              </Field>
            </FieldGroup>

            <div className="rule pt-5">
              <FieldGroup legend="How it is filed" className={GROUP}>
                <FieldRow>
                  <Field>
                    <Label htmlFor={`${fieldId}-category`}>Category</Label>
                    <NativeSelect
                      id={`${fieldId}-category`}
                      name="category"
                      required
                      defaultValue=""
                      className="h-11 sm:h-10"
                    >
                      <option value="" disabled>
                        Choose a category…
                      </option>
                      {categoriesByGroup().map(({ group, categories }) => (
                        <optgroup key={group} label={CATEGORY_GROUP_LABELS[group]}>
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {CATEGORY_META[category].label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field>
                    <Label htmlFor={`${fieldId}-priority`}>Priority</Label>
                    <NativeSelect
                      id={`${fieldId}-priority`}
                      name="priority"
                      defaultValue="medium"
                      className="h-11 sm:h-10"
                    >
                      {OBLIGATION_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FieldRow>
              </FieldGroup>
            </div>

            <div className="rule pt-5">
              <FieldGroup legend="Timing and ownership" className={GROUP}>
                <FieldRow>
                  <Field>
                    <Label htmlFor={`${fieldId}-due`}>Due date (optional)</Label>
                    <Input
                      id={`${fieldId}-due`}
                      name="dueDate"
                      type="date"
                      className="h-11 sm:h-10"
                    />
                    <FieldHint>Leave blank if there is no fixed calendar date.</FieldHint>
                  </Field>

                  <Field>
                    <Label htmlFor={`${fieldId}-owner`}>Suggested owner role (optional)</Label>
                    <Input
                      id={`${fieldId}-owner`}
                      name="suggestedOwnerRole"
                      maxLength={80}
                      autoComplete="off"
                      placeholder="e.g. Finance Director"
                      className="h-11 sm:h-10"
                    />
                  </Field>
                </FieldRow>
              </FieldGroup>
            </div>

            <FieldError>{error}</FieldError>
          </DialogBody>

          <DialogFooter className="rule pt-4">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending} className="min-h-11">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending ? "Adding…" : "Add to the register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
