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
        "text-sm font-medium leading-none text-foreground peer-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

const controlClasses =
  "flex w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn(controlClasses, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea className={cn(controlClasses, "min-h-20 resize-y", className)} {...props} />
  );
}

/** Native select — keyboard and screen-reader behaviour for free. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(controlClasses, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-muted-foreground", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-xs font-medium text-destructive", className)} {...props}>
      {children}
    </p>
  );
}

export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}
