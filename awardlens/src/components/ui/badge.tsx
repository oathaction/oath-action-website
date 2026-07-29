import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge.
 *
 * `variant` is the meaning. `emphasis` is how loudly to say it, and it is the
 * more important of the two.
 *
 * A list where every row carries the same filled pill spends a lot of ink to
 * say nothing: the reader learns to skip the column, and then misses the one
 * row that was different. So encode the common case cheaply and save the loud
 * treatment for the exception.
 *
 *   emphasis="solid"  a filled pill. For the exception — the overdue item, the
 *                     unverified source, the thing a person must act on.
 *   emphasis="quiet"  a coloured marker dot and plain text, no fill and no
 *                     border. For the state most rows are in. Same words, same
 *                     accessible text, a fraction of the ink.
 *   emphasis="bare"   text only. When the label alone carries it and even a dot
 *                     would be noise.
 *
 * Rule of thumb: if more than about a third of the rows on screen would show
 * the badge, it should be quiet.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap tracking-[0.005em] [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-foreground-soft",
        outline: "border-border-strong bg-transparent text-foreground-soft",
        primary: "border-transparent bg-primary-subtle text-primary-subtle-foreground",
        ink: "border-transparent bg-ink-accent-subtle text-ink-accent",
        success: "border-transparent bg-success-subtle text-success",
        warning: "border-warning-border bg-warning-subtle text-warning",
        destructive: "border-destructive-border bg-destructive-subtle text-destructive",
      },
      /*
       * Declared after `size` on purpose: cva emits variant classes in key
       * order, and `quiet` has to be able to strip the padding that `size`
       * applied.
       */
      size: {
        sm: "gap-1.5 px-2.5 py-0.5 text-xs",
        xs: "gap-1 px-2 py-px text-[11px]",
      },
      emphasis: {
        solid: "rounded-full border font-medium",
        quiet:
          "gap-1.5 border-0 bg-transparent p-0 font-medium before:size-[5px] before:shrink-0 before:rounded-full before:content-['']",
        bare: "gap-1.5 border-0 bg-transparent p-0 font-medium",
      },
    },
    compoundVariants: [
      /* Quiet and bare drop the pill entirely and re-state the ink colour, so
       * the label reads as text rather than as a control. */
      { emphasis: "quiet", variant: "neutral", class: "text-muted-foreground before:bg-border-control" },
      { emphasis: "quiet", variant: "outline", class: "text-muted-foreground before:bg-border-control" },
      { emphasis: "quiet", variant: "primary", class: "text-foreground-soft before:bg-primary" },
      { emphasis: "quiet", variant: "ink", class: "text-foreground-soft before:bg-ink-accent" },
      { emphasis: "quiet", variant: "success", class: "text-success before:bg-success" },
      { emphasis: "quiet", variant: "warning", class: "text-warning before:bg-warning" },
      { emphasis: "quiet", variant: "destructive", class: "text-destructive before:bg-destructive" },
      { emphasis: "bare", variant: "neutral", class: "text-muted-foreground" },
      { emphasis: "bare", variant: "outline", class: "text-muted-foreground" },
      { emphasis: "bare", variant: "primary", class: "text-foreground-soft" },
      { emphasis: "bare", variant: "ink", class: "text-foreground-soft" },
      { emphasis: "bare", variant: "success", class: "text-success" },
      { emphasis: "bare", variant: "warning", class: "text-warning" },
      { emphasis: "bare", variant: "destructive", class: "text-destructive" },
      /* The pill's horizontal padding is uneven on purpose: a rounded-full
       * cap adds optical space on the right of the last glyph, so the two look
       * balanced only when the box is not. */
      { emphasis: "solid", size: "sm", class: "pr-[0.65rem]" },
    ],
    defaultVariants: {
      variant: "neutral",
      emphasis: "solid",
      size: "sm",
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, emphasis, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, emphasis, size }), className)} {...props} />
  );
}

const dotVariants = cva("inline-block size-[5px] shrink-0 rounded-full", {
  variants: {
    variant: {
      neutral: "bg-border-control",
      outline: "bg-border-control",
      primary: "bg-primary",
      ink: "bg-ink-accent",
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
    },
  },
  defaultVariants: { variant: "neutral" },
});

/**
 * The marker on its own, for places that already state the status in words
 * nearby — a spine, a table cell, the leading edge of a row.
 *
 * It is decorative by default and hidden from assistive technology, because a
 * colour with no label is not information. If the dot is the only thing saying
 * what state a row is in, pass a `label` and it becomes a real, announced role.
 */
export function StatusDot({
  className,
  variant,
  label,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof dotVariants> & { label?: string }) {
  return (
    <span
      className={cn(dotVariants({ variant }), className)}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": "true" as const })}
      {...props}
    />
  );
}

export { badgeVariants, dotVariants };
