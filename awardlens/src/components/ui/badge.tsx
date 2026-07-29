import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-foreground-soft",
        outline: "border-border-strong bg-transparent text-foreground-soft",
        primary: "border-transparent bg-primary-subtle text-primary-subtle-foreground",
        ink: "border-transparent bg-ink-accent-subtle text-ink-accent",
        success: "border-transparent bg-success-subtle text-success",
        warning: "border-warning-border bg-warning-subtle text-warning",
        destructive:
          "border-destructive-border bg-destructive-subtle text-destructive",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
