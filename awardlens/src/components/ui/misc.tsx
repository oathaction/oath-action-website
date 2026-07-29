"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  tone = "default",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & {
  /**
   * `subtle` is for a rule *inside* a container, where a full-strength line
   * would compete with the container's own edge. `default` separates peers.
   */
  tone?: "default" | "subtle";
}) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0",
        tone === "subtle" ? "bg-border-subtle" : "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A progress bar must be named, and the type system enforces it.
 *
 * Radix renders `role="progressbar"` with `aria-valuenow`, so an unnamed one
 * announces a bare percentage with nothing saying what is at that percentage.
 * That is easy to forget at a call site and invisible in review — it already
 * happened once. Requiring one of `aria-label` or `aria-labelledby` here makes
 * the omission a compile error rather than something an audit has to catch.
 */
type RequiresAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

export function Progress({
  className,
  value,
  tone = "primary",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  RequiresAccessibleName & {
    /** Match the bar to what it measures: work done, or risk accumulating. */
    tone?: "primary" | "success" | "warning" | "neutral";
  }) {
  const indicator =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "neutral"
          ? "bg-border-control"
          : "bg-primary";

  return (
    <ProgressPrimitive.Root
      className={cn(
        // A translucent warm groove rather than a solid fill, so the track still
        // reads as a track on a tinted panel and not only on white.
        "relative h-1.5 w-full overflow-hidden rounded-full bg-[rgb(44_36_22/0.1)]",
        className,
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 rounded-full transition-transform duration-500", indicator)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-border-control bg-surface shadow-xs transition-colors",
        "hover:border-primary",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-muted disabled:opacity-70 disabled:shadow-none",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * A keyboard key. The review queue is keyboard-driven, and a shortcut written
 * as plain text ("press j") is invisible next to one that is drawn as a key.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center rounded-[4px] border border-border-strong bg-surface px-1",
        "font-sans text-[0.7em] font-medium text-foreground-soft shadow-[0_1px_0_var(--border-strong)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Empty state.
 *
 * An empty screen is a layout problem before it is a copy problem: a heading, a
 * sentence and two buttons pinned to the top of a 900px viewport leave 300px of
 * dead space and a stranded footer. This centres the whole group inside its
 * container and gives it a floor, so "nothing here yet" looks composed rather
 * than unfinished.
 *
 * Pass `bordered` when it sits directly on the page background and needs an
 * edge; leave it off when it is already inside a Card.
 */
export function EmptyState({
  className,
  icon,
  title,
  description,
  actions,
  bordered = true,
  headingLevel = 2,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  bordered?: boolean;
  /** Match the surrounding document outline — skipping a level is an axe failure. */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div
      className={cn(
        "flex min-h-[18rem] flex-col items-center justify-center px-6 py-12 text-center",
        bordered && "rounded-lg border border-dashed border-border-strong bg-surface/60",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <Heading className="type-subhead text-foreground">{title}</Heading>
      {description ? (
        <p className="measure mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}
