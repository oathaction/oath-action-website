import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * The variants are an emphasis ladder, and an action row should use no more
 * than three rungs of it. In a row like "Confirm · Needs clarification · Not
 * applicable · Edit · Delete", exactly one thing is the action and the rest are
 * escapes: `primary` for the action, `muted` or `secondary` for the plausible
 * alternatives, `ghost` / `destructiveGhost` for the rare ones. Giving all five
 * the same weight is what makes a row unreadable.
 *
 *   primary            the action. One per surface.
 *   secondary          a real alternative, with a control boundary.
 *   muted              a quiet alternative — present, but not competing.
 *   subtle             evergreen wash; a selected/active toggle.
 *   ghost              chrome-free; toolbar and row-level actions.
 *   destructive        a destructive action being confirmed.
 *   destructiveOutline a destructive action being offered.
 *   destructiveGhost   a destructive action sitting in a row of ordinary ones.
 *   link               inline, inside prose.
 *
 * Optical notes: leading icons are pulled a half-step left because an icon's
 * bounding box has more air than a letter's, and the gap tightens at the small
 * sizes where 8px starts to look like a space character.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium",
    "transition-[color,background-color,border-color,box-shadow] duration-150",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-active",
        secondary:
          "border border-border-control bg-surface text-foreground shadow-xs hover:bg-muted active:bg-surface-sunken",
        ghost: "text-foreground-soft hover:bg-muted hover:text-foreground active:bg-surface-sunken",
        muted:
          "bg-muted text-foreground-soft hover:bg-surface-sunken hover:text-foreground active:bg-border",
        subtle:
          "bg-primary-subtle text-primary-subtle-foreground hover:bg-primary-subtle/70 active:bg-primary-subtle",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-hover active:bg-destructive-hover",
        destructiveOutline:
          "border border-destructive-border bg-surface text-destructive shadow-xs hover:bg-destructive-subtle active:bg-destructive-subtle",
        destructiveGhost:
          "text-destructive hover:bg-destructive-subtle hover:text-destructive active:bg-destructive-subtle",
        link: "text-primary underline decoration-primary/35 underline-offset-4 hover:text-primary-hover hover:decoration-primary",
      },
      size: {
        xs: "h-7 gap-1 rounded-sm px-2 text-xs [&_svg]:size-3.5 [&>svg:first-child]:-ml-px [&>svg:last-child]:-mr-px",
        sm: "h-8 gap-1.5 px-3 text-[13px] [&_svg]:size-4 [&>svg:first-child]:-ml-0.5 [&>svg:last-child]:-mr-0.5",
        md: "h-10 gap-2 px-4 text-sm [&_svg]:size-4 [&>svg:first-child]:-ml-0.5 [&>svg:last-child]:-mr-0.5",
        lg: "h-11 gap-2 px-6 text-[15px] [&_svg]:size-[18px] [&>svg:first-child]:-ml-1 [&>svg:last-child]:-mr-1",
        icon: "size-9 text-sm [&_svg]:size-4",
        iconSm: "size-8 rounded-sm text-sm [&_svg]:size-4",
        iconLg: "size-11 text-sm [&_svg]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

/**
 * A row of related actions. Sets the gap once so siblings stop disagreeing, and
 * keeps a `data-print="hide"` row from collapsing awkwardly when it wraps.
 */
export function ButtonRow({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}

export { buttonVariants };
