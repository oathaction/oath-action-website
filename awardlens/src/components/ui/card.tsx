import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Card — the default container.
 *
 * Elevation is the hierarchy signal. A page of identically-bordered boxes says
 * everything matters equally, which is the same as saying nothing does, so each
 * level here means something specific:
 *
 *   flat      no shadow. Nested inside another card, or in a dense grid where
 *             shadows would turn into texture.
 *   resting   the default. A card sitting on the page.
 *   raised    this is the object the screen is about — the selected item, the
 *             recommended plan, the thing you came here to do. Ideally one per
 *             view; two raised cards raise nothing.
 *   floating  it is not on the page, it is over it. Menus and popovers. A
 *             dialog uses shadow-overlay instead, via <DialogContent>.
 *
 * `interactive` adds the hover response a clickable card needs. It does not
 * make the card focusable — put a real button or link inside it.
 *
 * Pass `elevation` rather than a `shadow-*` class: tailwind-merge does not
 * understand our custom shadow names and will not de-duplicate them.
 */
const cardVariants = cva("rounded-lg text-foreground", {
  variants: {
    tone: {
      /** White. The default reading surface for a container. */
      default: "border border-border bg-surface",
      /** Recedes: grouped metadata, an aside, a footer panel. */
      sunken: "border border-border bg-surface-sunken",
      /** Warm paper. Long-form document text and quoted source material. */
      paper: "border border-paper-border bg-paper",
      /** Evergreen wash. The one card on a page that is being recommended. */
      primary: "border border-primary-border bg-primary-subtle",
      /** Authority blue wash. Provenance and "how this was derived" notes. */
      accent: "border border-ink-accent-border bg-ink-accent-subtle",
    },
    elevation: {
      flat: "",
      resting: "shadow-resting",
      raised: "shadow-raised",
      floating: "shadow-popover",
    },
    interactive: {
      true: "transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-raised",
      false: "",
    },
  },
  defaultVariants: {
    tone: "default",
    elevation: "resting",
    interactive: false,
  },
});

export interface CardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {}

export function Card({ className, tone, elevation, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ tone, elevation, interactive }), className)}
      {...props}
    />
  );
}

/**
 * Padding density, shared by header / content / footer so the three never
 * disagree inside one card.
 *
 *   tight    14/16px — dense lists, compact rows, sidebar panels
 *   default  20px    — everything else
 *   roomy    28px    — pricing, hero panels, anything built around a metric
 */
type CardPadding = "tight" | "default" | "roomy";

const PAD: Record<CardPadding, { x: string; top: string; bottom: string; inset: string }> = {
  tight: { x: "px-4", top: "pt-3.5", bottom: "pb-3.5", inset: "-mx-4" },
  default: { x: "px-5", top: "pt-5", bottom: "pb-5", inset: "-mx-5" },
  roomy: { x: "px-7", top: "pt-7", bottom: "pb-7", inset: "-mx-7" },
};

export interface CardSectionProps extends React.ComponentProps<"div"> {
  padding?: CardPadding;
}

export function CardHeader({ className, padding = "default", ...props }: CardSectionProps) {
  const pad = PAD[padding];
  return (
    <div
      className={cn("flex flex-col gap-1.5", pad.x, pad.top, pad.bottom, className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("type-subhead text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("type-small text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, padding = "default", ...props }: CardSectionProps) {
  const pad = PAD[padding];
  return <div className={cn(pad.x, pad.bottom, "pt-0", className)} {...props} />;
}

export function CardFooter({ className, padding = "default", ...props }: CardSectionProps) {
  const pad = PAD[padding];
  return (
    <div
      className={cn("flex items-center gap-2", pad.x, pad.bottom, "pt-0", className)}
      {...props}
    />
  );
}

/**
 * A hairline spanning the full width of a card, cancelling the card's own
 * horizontal padding. Lighter than the card's border, because a rule inside a
 * container should never compete with the container's edge.
 */
export function CardDivider({ className, padding = "default", ...props }: CardSectionProps) {
  return (
    <div
      role="presentation"
      className={cn("my-5 h-px bg-border-subtle", PAD[padding].inset, className)}
      {...props}
    />
  );
}

export { cardVariants };
