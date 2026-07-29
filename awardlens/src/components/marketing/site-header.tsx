"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The aperture mark. Drawn inline so the wordmark inherits `currentColor`,
 * scales with the type, and never costs a network request.
 */
export function AwardLensMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <g stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" opacity="0.62">
        <path d="M12 7.5 15.9 9.75 15.9 14.25 12 16.5 8.1 14.25 8.1 9.75Z" />
        <path d="M12 7.5V3" strokeLinecap="round" />
        <path d="M8.1 14.25 4.21 16.5" strokeLinecap="round" />
        <path d="M15.9 14.25 19.79 16.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Anchors are written absolutely (`/#faq`) so the same header works on
 * `/pricing` — from there they navigate home and then scroll.
 */
const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#outputs", label: "What you get" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

/**
 * The only client component on the marketing site. It exists because a menu
 * that does not close when you tap a link is worse than a little JavaScript:
 * most of these links are in-page anchors, and a client-side navigation leaves
 * a CSS-only <details> panel sitting over the section you just asked to see.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  /*
   * Opaque, and separated by `--shadow-header` rather than a border: the token
   * draws the same hairline plus a very short falloff, so content scrolling
   * underneath reads as *under* the bar instead of butting against a line. No
   * blur — a translucent header ghosts document text through itself.
   */
  return (
    <header
      className="sticky top-0 z-50 bg-background shadow-header"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link
          href="/"
          onClick={close}
          className="flex shrink-0 items-center gap-2.5 rounded-sm text-foreground"
          aria-label="AwardLens — home"
        >
          <AwardLensMark className="size-7 text-primary" />
          <span className="type-subhead">AwardLens</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-sm px-3 py-2 text-sm font-medium text-foreground-soft transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/app/awards/new">Analyse an award</Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-mobile-nav"
          aria-label="Menu"
          className="flex size-10 items-center justify-center rounded-md text-foreground-soft transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          {open ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>

      {/*
       * Always rendered so `aria-controls` always resolves; the `hidden`
       * attribute does the showing and hiding.
       */}
      <div
        id="site-mobile-nav"
        hidden={!open}
        className="fixed inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-surface shadow-popover md:hidden"
      >
        <nav aria-label="Primary, mobile" className="container-page py-2">
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.href} className="border-b border-border last:border-b-0">
                <Link
                  href={link.href}
                  onClick={close}
                  className="block rounded-sm py-3.5 text-[15px] font-medium text-foreground-soft"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="container-page flex flex-col gap-2 pb-6 pt-3">
          <Button asChild size="lg">
            <Link href="/app/awards/new" onClick={close}>
              Analyse an award
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/auth/sign-in" onClick={close}>
              Sign in
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
