import Link from "next/link";
import { FileStack, LayoutDashboard, Plus, Settings } from "lucide-react";

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
      <header
        className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur"
        data-app-nav
      >
        <div className="container-page flex h-14 items-center gap-4">
          <Link
            href="/app"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <svg viewBox="0 0 20 20" className="size-5 text-primary" aria-hidden="true">
              <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 4.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" opacity="0.9" />
            </svg>
            AwardLens
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            <NavLink href="/app" icon={<LayoutDashboard className="size-4" />} label="Dashboard" />
            <NavLink href="/app/settings" icon={<Settings className="size-4" />} label="Settings" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href="/app/awards/new">
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">New award</span>
                <span className="sr-only sm:hidden">New award</span>
              </Link>
            </Button>
            <SignOutButton email={session.profile.email} />
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

      <footer className="border-t border-border py-6" data-app-footer>
        <div className="container-page flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5">
            <FileStack className="size-3.5" aria-hidden="true" />
            {session.organization.name}
          </p>
          <p className="max-w-2xl">
            AwardLens organises what your award documents say. It does not provide legal,
            accounting, tax or compliance advice, and cannot guarantee that every requirement was
            found.
          </p>
        </div>
      </footer>
    </div>
  );
}

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
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span aria-hidden="true">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Link>
  );
}
