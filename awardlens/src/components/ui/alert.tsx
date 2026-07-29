import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        info: "border-border bg-muted text-foreground-soft",
        primary: "border-transparent bg-primary-subtle text-primary-subtle-foreground",
        warning: "border-warning-border bg-warning-subtle text-warning",
        destructive:
          "border-destructive-border bg-destructive-subtle text-destructive",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export interface AlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mb-0.5 font-semibold", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("[&_p]:leading-relaxed", className)} {...props} />;
}
