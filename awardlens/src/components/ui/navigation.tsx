"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------- Tabs ---- */

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "relative flex items-center gap-1 overflow-x-auto border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The tab underline is a pseudo-element, not a border, for three reasons: it
 * can be inset from the label's padding so the rule tracks the word rather than
 * the hit area, it can have rounded caps, and it can animate its colour without
 * the 1px reflow that toggling a border-bottom causes.
 *
 * 2px is the weight. 1px disappears next to the list's own hairline; 3px starts
 * to look like a progress bar. The label weight never changes between states —
 * a font-weight swap on tab change makes the whole row jitter — so the active
 * state is carried by ink colour plus the rule.
 *
 * Exported as a string so a nav built from <Link>s can look identical to a real
 * tablist without pretending to be one.
 */
export const tabTriggerClasses = cn(
  "group relative -mb-px whitespace-nowrap rounded-t-sm px-3 py-2.5 text-sm font-medium",
  "text-muted-foreground transition-colors hover:text-foreground",
  "after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-px after:h-0.5",
  "after:rounded-full after:bg-transparent after:transition-colors after:content-['']",
  "hover:after:bg-border-strong",
  "data-[state=active]:text-foreground data-[state=active]:after:bg-primary",
  "aria-[current=page]:text-foreground aria-[current=page]:after:bg-primary",
);

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn(tabTriggerClasses, className)} {...props} />;
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-5", className)} {...props} />;
}

/**
 * A count that rides along with a tab label. Muted when the tab is idle so it
 * reads as a footnote, and it inherits the active ink so the pair moves as one.
 */
export function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "tabular ml-1.5 text-xs font-normal text-muted-foreground",
        "group-data-[state=active]:text-foreground-soft",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------- Tooltip ---- */

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "animate-popover-in z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5",
          "text-xs font-medium leading-relaxed text-background shadow-popover",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/* ----------------------------------------------------- Dropdown menu ---- */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "animate-popover-in z-50 min-w-48 overflow-hidden rounded-lg border border-border",
          "bg-surface p-1 shadow-popover",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2",
        "text-sm text-foreground-soft outline-none transition-colors",
        "focus:bg-muted focus:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        "focus:[&_svg]:text-foreground-soft",
        className,
      )}
      {...props}
    />
  );
}

/** A menu item that destroys something. Red on hover, not red at rest. */
export function DropdownMenuDestructiveItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2",
        "text-sm text-destructive outline-none transition-colors",
        "focus:bg-destructive-subtle",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("eyebrow px-2.5 pb-1 pt-2 text-muted-foreground", className)}
      {...props}
    />
  );
}

/* --------------------------------------------------------- Accordion ---- */

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b border-border-subtle last:border-b-0", className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex flex-1 items-center justify-between gap-4 py-4 text-left",
          "text-[15px] font-medium leading-snug tracking-[-0.008em] text-foreground",
          "transition-colors hover:text-primary [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-primary"
          aria-hidden="true"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className={cn("overflow-hidden text-sm text-muted-foreground", className)}
      {...props}
    >
      <div className="measure-wide pb-5 pr-8 leading-relaxed">{children}</div>
    </AccordionPrimitive.Content>
  );
}
