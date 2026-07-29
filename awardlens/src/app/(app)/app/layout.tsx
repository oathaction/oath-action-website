import Link from "next/link";
import { LayoutDashboard, Plus, Settings } from "lucide-react";

import { requireSession } from "@/lib/auth";
import { describeConfig } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/app/sign-out-button";
import { ModeNotice } from "@/components/app/mode-notice";

/**
 * Every authenticated route sits under this layout, which is the single place
 * the session is required. Protecting here rather than in proxy/middleware
 * keeps the check on the server that renders the data.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const config = describeConfig();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/*
       * The scrolled state of the sticky header.
       *
       * The header is opaque — it used to be `bg-background/95 backdrop-blur`,
       * so a table of dates ghosted through it on the way past, which in a
       * product about reading numbers off a screen is a correctness problem
       * before it is an aesthetic one. Opaque solves the ghosting but leaves the
       * bar looking painted on, so it earns a shadow only once there is
       * something underneath it to separate from.
       *
       * A scroll-driven animation rather than a scroll listener: this layout is
       * a server component, and a client component that exists solely to set a
       * boolean on scroll would run an event handler on every frame of every
       * page for one box-shadow. Both ways of not supporting it are fine — a
       * browser without `animation-timeline` keeps the hairline and no shadow,
       * and a reduced-motion setting that pins the animation to its end state
       * simply leaves the shadow always on.
       */}
      <style href="al-app-header" precedence="high">{`
        @supports (animation-timeline: scroll()) {
          [data-app-header] {
            animation: al-header-lift linear both;
            animation-timeline: scroll(root block);
            animation-range: 0 3.5rem;
          }
          @keyframes al-header-lift {
            from { box-shadow: 0 0 0 0 rgb(var(--shadow-tint) / 0); }
            to   { box-shadow: 0 1px 0 var(--border), 0 10px 20px -14px rgb(var(--shadow-tint) / 0.7); }
          }
        }
      `}</style>

      <header
        className="sticky top-0 z-40 border-b border-border bg-background"
        data-app-header
        data-app-nav
        data-print="hide"
      >
        <div className="container-page flex h-14 items-center gap-3">
          <Link
            href="/app"
            aria-label="AwardLens"
            className="flex shrink-0 items-center gap-2 rounded-sm text-foreground"
          >
            <AwardLensMark />
            <span className="hidden text-[15px] font-semibold tracking-[-0.02em] sm:inline">
              AwardLens
            </span>
          </Link>

          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />

          <nav aria-label="Main" className="flex items-center gap-0.5">
            <NavLink href="/app" icon={<LayoutDashboard />} label="Dashboard" />
            <NavLink href="/app/settings" icon={<Settings />} label="Settings" />
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href="/app/awards/new">
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">New award</span>
                <span className="sr-only sm:hidden">New award</span>
              </Link>
            </Button>
            <SignOutButton
              email={session.profile.email}
              organizationName={session.organization.name}
            />
          </div>
        </div>
      </header>

      <ModeNotice
        aiMode={config.aiMode}
        billingMode={config.billingMode}
        storageMode={config.storageMode}
      />

      <main id="main" className="flex-1 pb-16">
        {children}
      </main>

      {/*
       * A tinted band rather than a hairline. On a short page — the empty
       * dashboard especially — a footer that is only a rule reads as the page
       * having run out rather than having ended.
       */}
      <footer
        className="border-t border-border bg-surface-sunken py-7"
        data-app-footer
        data-print="hide"
      >
        <div className="container-page flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-12">
          <p className="type-caption shrink-0 text-foreground-soft">
            {session.organization.name}
          </p>
          <p className="measure-wide text-[13px] leading-relaxed text-muted-foreground">
            AwardLens organises what your award documents say. It does not provide legal,
            accounting, tax or compliance advice, and cannot guarantee that every requirement was
            found.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The aperture mark, drawn inline so it inherits `currentColor` and costs no
 * request. Deliberately the same drawing as the marketing header's mark — one
 * product, one mark — see `src/components/marketing/site-header.tsx`.
 */
function AwardLensMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-[26px] text-primary">
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
 * The label is always rendered. It used to be `sr-only` below 640px, which left
 * a phone with two unlabelled glyphs — a grid and a cog — as the entire
 * navigation of an application people use to avoid breaching a grant. The icon
 * is the part that gets dropped at that width instead: it was the decoration.
 */
function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
    >
      <span aria-hidden="true" className="hidden sm:flex [&>svg]:size-4">
        {icon}
      </span>
      {label}
    </Link>
  );
}
