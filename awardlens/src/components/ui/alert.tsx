import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Alert.
 *
 * Amber and red are a budget, not a palette. A banner that appears on every
 * page is configuration, not an alarm, and painting it the same colour as a
 * genuine risk teaches people to ignore both. Pick the quietest variant that
 * still gets read:
 *
 *   quiet         a hairline and muted ink, no fill. Standing information that
 *                 must stay discoverable but must not compete: environment
 *                 notices, "this is how the export works", persistent context.
 *   info          a soft stone fill. A one-off explanation attached to a task.
 *   primary       evergreen. Something good happened, or is available.
 *   warningQuiet  pale parchment, amber only in the icon. Use for anything that
 *                 is on screen all the time and merely wants noticing.
 *   warning       full amber. Something on *this* page needs a decision.
 *   destructive   red. Something is wrong or is about to be destroyed.
 *
 * `role="alert"` is the default because most call sites announce a change. For
 * standing content, pass `role="note"` or `role="status"` — the spread wins.
 */
const alertVariants = cva("relative w-full text-sm [&>svg]:size-4 [&>svg]:shrink-0", {
  variants: {
    variant: {
      quiet: "border-border-subtle bg-transparent text-foreground-soft", /* 10.55:1 on background */
      info: "border-border bg-muted text-foreground-soft", /* 9.58:1 on --muted */
      primary: "border-transparent bg-primary-subtle text-primary-subtle-foreground", /* 9.40:1 */
      warningQuiet: "border-warning-border bg-warning-quiet text-foreground-soft", /* 10.38:1 on --warning-quiet */
      warning: "border-warning-border bg-warning-subtle text-warning", /* 5.57:1 */
      destructive: "border-destructive-border bg-destructive-subtle text-destructive", /* 5.72:1 */
    },
    size: {
      sm: "rounded-md border px-3 py-2 text-xs",
      md: "rounded-lg border px-4 py-3",
      /* Edge to edge under a header or above a footer: no radius, one hairline. */
      bar: "border-x-0 border-t-0 border-b px-4 py-2 text-[13px]",
    },
  },
  defaultVariants: { variant: "info", size: "md" },
});

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

const ICON_TONE: Record<AlertVariant, string> = {
  quiet: "text-muted-foreground",
  info: "text-muted-foreground",
  primary: "text-primary",
  warningQuiet: "text-warning",
  warning: "text-warning",
  destructive: "text-destructive",
};

export interface AlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof alertVariants> {
  /**
   * Optional leading icon. Supplying it here rather than as a child gets the
   * two-column grid, the optical top alignment against the first line of text,
   * and the right tone for the variant — and keeps the icon out of the
   * accessibility tree, where it would otherwise be read as an empty image.
   */
  icon?: React.ReactNode;
}

export function Alert({ className, variant, size, icon, children, ...props }: AlertProps) {
  if (!icon) {
    return (
      <div
        role="alert"
        className={cn(alertVariants({ variant, size }), className)}
        {...props}
      />
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        alertVariants({ variant, size }),
        "grid grid-cols-[auto_1fr] items-start gap-x-3",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-px flex shrink-0 [&>svg]:size-4 [&>svg]:shrink-0",
          ICON_TONE[variant ?? "info"],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("mb-0.5 font-semibold tracking-[-0.006em]", className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("[&_p]:leading-relaxed", className)} {...props} />;
}

export { alertVariants };
