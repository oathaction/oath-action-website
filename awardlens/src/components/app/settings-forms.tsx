"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldHint, Input, Label } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/misc";
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
import {
  deleteAllDataAction,
  startCheckoutAction,
  updateNotificationPreferencesAction,
  updateOrganizationAction,
  updateProfileAction,
} from "@/app/actions/settings";
import type { PlanId } from "@/lib/domain/types";

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (action: (data: FormData) => Promise<{ ok: boolean; message: string | null }>, data: FormData) => {
    startTransition(async () => {
      const result = await action(data);
      if (result.ok) toast.success(result.message ?? "Saved.");
      else toast.error(result.message ?? "Something went wrong.");
    });
  };
  return { pending, run };
}

/*
 * Both of these used to be `flex items-end`, which put Save on the baseline of
 * whatever the field happened to end with — level with the input in one form
 * and level with the hint text in the other, so the same control landed at two
 * different heights on one page. Stacking the action under the field is one
 * rule that holds for every form here, hint or no hint.
 */
export function ProfileForm({ fullName }: { fullName: string }) {
  const { pending, run } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(updateProfileAction, new FormData(event.currentTarget));
      }}
      className="stack-md"
    >
      <Field className="max-w-sm">
        <Label htmlFor="fullName">Your name</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} maxLength={120} />
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

export function OrganizationForm({ name }: { name: string }) {
  const { pending, run } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(updateOrganizationAction, new FormData(event.currentTarget));
      }}
      className="stack-md"
    >
      <Field className="max-w-sm">
        <Label htmlFor="orgName">Organisation name</Label>
        <Input id="orgName" name="name" defaultValue={name} maxLength={120} required />
        <FieldHint>Appears on exports and the printable operating plan.</FieldHint>
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

export function NotificationForm({
  enabled,
  offsets,
  allOffsets,
}: {
  enabled: boolean;
  offsets: number[];
  allOffsets: number[];
}) {
  const { pending, run } = useAction();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [selected, setSelected] = useState<number[]>(offsets);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData();
        if (isEnabled) data.set("enabled", "on");
        for (const offset of selected) data.append("offsets", String(offset));
        run(updateNotificationPreferencesAction, data);
      }}
      className="stack-lg"
    >
      <div className="flex items-center gap-2.5">
        <Checkbox
          id="reminders-enabled"
          checked={isEnabled}
          onCheckedChange={(value) => setIsEnabled(value === true)}
        />
        <Label htmlFor="reminders-enabled">Email me before confirmed deadlines</Label>
      </div>

      <fieldset
        disabled={!isEnabled}
        className="rounded-md border border-border-subtle bg-surface-sunken/60 px-4 py-3.5 transition-opacity disabled:opacity-55"
      >
        <legend className="eyebrow px-1 text-muted-foreground">Send reminders</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {allOffsets.map((offset) => (
            <div key={offset} className="flex items-center gap-2">
              <Checkbox
                id={`offset-${offset}`}
                checked={selected.includes(offset)}
                onCheckedChange={(value) =>
                  setSelected((current) =>
                    value === true
                      ? [...current, offset].sort((a, b) => b - a)
                      : current.filter((entry) => entry !== offset),
                  )
                }
              />
              <Label htmlFor={`offset-${offset}`} className="text-[13px] font-normal">
                {offset} {offset === 1 ? "day" : "days"} before
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Save reminder settings
      </Button>
    </form>
  );
}

export function PlanButton({ planId, planName }: { planId: PlanId; planName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    /*
     * Secondary, not primary. Three filled evergreen bars down a plan grid
     * spend the action colour on a choice nobody came to this page to make;
     * the tint on the *current* plan is what should be carrying colour here.
     */
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="w-full"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set("planId", planId);
        startTransition(async () => {
          // A successful Stripe path redirects and never returns a value here.
          const result = await startCheckoutAction(data);
          if (result && !result.ok) toast.error(result.message ?? "Could not start checkout.");
          else if (result?.message) toast.success(result.message);
        });
      }}
    >
      {pending ? "Working…" : `Choose ${planName}`}
    </Button>
  );
}

export function DeleteEverythingForm({ organizationName }: { organizationName: string }) {
  const [confirmation, setConfirmation] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructiveOutline" size="sm">
          Delete everything and sign out
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete all data for {organizationName}?</DialogTitle>
          <DialogDescription>
            This permanently removes every award, every uploaded document, every obligation and
            citation, all reminders, your question history and your billing record. It cannot be
            undone and there is no backup we can restore for you.
          </DialogDescription>
        </DialogHeader>

        <form action={deleteAllDataAction} className="space-y-3">
          <Field>
            <Label htmlFor="confirm-org">
              Type <span className="font-mono">{organizationName}</span> to confirm
            </Label>
            <Input
              id="confirm-org"
              name="confirm"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirmation !== organizationName}
            >
              Delete everything
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
