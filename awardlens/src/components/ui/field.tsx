"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "text-sm font-medium leading-none tracking-[-0.006em] text-foreground peer-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Shared control chrome.
 *
 * Three deliberate choices:
 *
 *  1. The border is --border-control (3.30:1 on white), not the decorative
 *     --border-strong (1.64:1). An input on a near-white page is a boundary a
 *     person has to find, and WCAG 1.4.11 asks for 3:1 on exactly this.
 *  2. Focus keeps the global 2px outline and *also* darkens the border, so the
 *     field still reads as focused in a screenshot, in high-contrast mode, and
 *     for anyone who cannot distinguish the ring colour from the border.
 *  3. The error state is driven by `aria-invalid`, which the field needs for
 *     screen-reader users anyway. Setting the attribute is what styles it —
 *     there is no way to show the red without also announcing it.
 */
const controlClasses = [
  "flex w-full rounded-md border border-border-control bg-surface px-3 py-2 text-sm text-foreground",
  "shadow-xs transition-[color,border-color,background-color] duration-150",
  "placeholder:text-muted-foreground",
  "hover:border-foreground-soft/60",
  "focus-visible:border-primary",
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive-subtle/40",
  "disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
].join(" ");

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn(controlClasses, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlClasses, "min-h-20 resize-y leading-relaxed", className)}
      {...props}
    />
  );
}

/** Native select — keyboard and screen-reader behaviour for free. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(controlClasses, "h-10 cursor-pointer pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cn("text-xs font-medium leading-relaxed text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/**
 * A row of fields that sit side by side above a certain width and stack below
 * it. Saves every form re-deciding the same breakpoint.
 */
export function FieldRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />
  );
}

/**
 * A named group of fields — a fieldset with a real legend, which is how a
 * screen reader learns that six controls belong to one question.
 */
export function FieldGroup({
  className,
  legend,
  description,
  children,
  ...props
}: React.ComponentProps<"fieldset"> & { legend: string; description?: React.ReactNode }) {
  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)} {...props}>
      <legend className="type-subhead mb-1 p-0 text-foreground">{legend}</legend>
      {description ? (
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
    </fieldset>
  );
}
