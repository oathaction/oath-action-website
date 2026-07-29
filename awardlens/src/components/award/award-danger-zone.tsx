"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDivider, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/field";
import {
  deleteAwardAction,
  deleteDocumentAction,
  reprocessAwardAction,
} from "@/app/actions/awards";

export function AwardDangerZone({
  awardId,
  documentId,
  canReprocess,
}: {
  awardId: string;
  documentId: string | null;
  canReprocess: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");

  const reprocess = () => {
    const formData = new FormData();
    formData.set("awardId", awardId);
    startTransition(async () => {
      const result = await reprocessAwardAction(formData);
      if (result.ok) toast.success(result.message ?? "Re-analysed.");
      else toast.error(result.message ?? "Could not re-analyse.");
    });
  };

  const removeDocument = () => {
    if (!documentId) return;
    const formData = new FormData();
    formData.set("documentId", documentId);
    startTransition(async () => {
      const result = await deleteDocumentAction(formData);
      if (result.ok) toast.success(result.message ?? "Document deleted.");
      else toast.error(result.message ?? "Could not delete the document.");
    });
  };

  return (
    <Card tone="sunken" elevation="flat">
      <CardHeader padding="tight" className="pb-2.5">
        <CardTitle className="text-[15px]">Manage this award</CardTitle>
      </CardHeader>
      <CardContent padding="tight" className="space-y-2">
        {canReprocess ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 w-full justify-start sm:min-h-8"
            disabled={pending}
            onClick={reprocess}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Re-analyse the document
          </Button>
        ) : null}

        {documentId ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11 w-full justify-start sm:min-h-8"
                disabled={pending}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete the stored document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete the stored document?</DialogTitle>
                <DialogDescription>
                  The file is removed from storage permanently. Your obligation register stays, but
                  the source passages behind each item can no longer be opened, and the award
                  cannot be re-analysed.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Keep it</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={removeDocument} disabled={pending}>
                    Delete document
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        {/* Below a rule, on its own: an irreversible action should not sit in
            the same visual run as re-analysing a file. */}
        <CardDivider padding="tight" className="my-3" />

        <Dialog>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="destructiveOutline"
              size="sm"
              className="min-h-11 w-full justify-start sm:min-h-8"
              disabled={pending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete this award
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this award?</DialogTitle>
              <DialogDescription>
                This permanently removes the award, its stored document, every obligation and
                citation, all reminders, and the question history. It cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <form action={deleteAwardAction} className="space-y-3">
              <input type="hidden" name="awardId" value={awardId} />
              <label htmlFor="confirm-delete" className="block text-sm font-medium">
                Type <span className="font-mono">delete</span> to confirm
              </label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(event) => setConfirmText(event.currentTarget.value)}
                autoComplete="off"
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={confirmText !== "delete"}>
                  Delete permanently
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
