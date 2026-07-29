"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { addObligationAction } from "@/app/actions/obligations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/field";
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_META,
  OBLIGATION_CATEGORIES,
  OBLIGATION_PRIORITIES,
  PRIORITY_LABELS,
  type CategoryGroup,
  type ObligationCategory,
} from "@/lib/domain/types";

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

      <DialogContent aria-describedby={`${fieldId}-intro`}>
        <DialogHeader>
          <DialogTitle>Add an obligation</DialogTitle>
          <DialogDescription id={`${fieldId}-intro`}>
            Use this for a requirement you know about that the document does not state — an
            internal deadline, a funder instruction given by email, a commitment made in the
            application.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border border-border bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-foreground-soft">
          <span className="font-semibold">How this will be recorded.</span> An obligation you add
          yourself is stored as <span className="font-semibold">confirmed</span> and{" "}
          <span className="font-semibold">entered by you</span>, with no source citation, because
          there is no passage in the document to point at. That keeps it permanently
          distinguishable from anything AwardLens extracted from the award, in the register and in
          every export.
        </p>

        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-4">
          <input type="hidden" name="awardId" value={awardId} />

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

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor={`${fieldId}-due`}>Due date (optional)</Label>
              <Input id={`${fieldId}-due`} name="dueDate" type="date" className="h-11 sm:h-10" />
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
          </div>

          <FieldError>{error}</FieldError>

          <DialogFooter>
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
