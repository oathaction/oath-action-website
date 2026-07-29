"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * The scrim is a warm near-black at 34%, and it does not blur.
 *
 * Blur is the wrong tool here: this product's modals sit on top of a document a
 * person is checking against, and smearing that document is both a legibility
 * cost and a claim ("this content is decorative") that is not true. Darkening
 * separates the layers honestly, and it costs nothing to composite.
 */
function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn("animate-overlay-in fixed inset-0 z-50 bg-[var(--overlay)]", className)}
      {...props}
    />
  );
}

/**
 * A close affordance needs a hit area, not just a glyph. 32px square with a
 * hover wash gives the target a shape before the pointer arrives, which is the
 * difference between "there is a control here" and "there is an icon here".
 */
const closeButtonClasses = cn(
  "absolute right-3.5 top-3.5 flex size-8 items-center justify-center rounded-md",
  "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
);

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "animate-dialog-in fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg",
          "-translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-surface p-6",
          "shadow-overlay max-h-[calc(100vh-4rem)] overflow-y-auto",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className={closeButtonClasses} aria-label="Close">
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Right-hand drawer. Used for the mobile source panel. */
export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "right" | "bottom" }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface shadow-overlay",
          side === "right"
            ? "animate-sheet-in-right inset-y-0 right-0 h-full w-[min(30rem,100vw-2rem)] border-l"
            : "animate-sheet-in-bottom inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-t",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className={closeButtonClasses} aria-label="Close">
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

/**
 * The scrolling middle of a tall dialog. Bleeds to the dialog's edges so the
 * scroll shadow and any full-width rows reach the sides, then restores the
 * padding inside — a scroll container that stops short of the edge always looks
 * like a mistake.
 */
export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("-mx-6 min-h-0 flex-1 overflow-y-auto px-6", className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("type-subhead text-foreground", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("type-small text-muted-foreground", className)}
      {...props}
    />
  );
}
