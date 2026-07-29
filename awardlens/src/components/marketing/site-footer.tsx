import Link from "next/link";

import { AwardLensMark } from "@/components/marketing/site-header";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#outputs", label: "What you get" },
      { href: "/#evidence", label: "Source linking" },
      { href: "/demo", label: "View a sample" },
    ],
  },
  {
    heading: "Plans",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/pricing#assisted-setup", label: "Assisted setup" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/app/awards/new", label: "Analyse an award" },
      { href: "/auth/sign-in", label: "Sign in" },
      { href: "/#privacy", label: "Security and privacy" },
    ],
  },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface-sunken">
      <div className="container-page py-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-12">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 text-foreground">
              <AwardLensMark className="size-6 text-primary" />
              <span className="text-[15px] font-semibold tracking-[-0.02em]">AwardLens</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Post-award grant management for small nonprofits. Upload an award, get a
              source-linked register of what was promised, and confirm every item yourself.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-sm text-foreground-soft transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-start md:justify-between">
          <p className="text-xs text-muted-foreground">
            &copy; {year} AwardLens. Every extracted item cites its source; a person confirms it.
          </p>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            AwardLens organises what your award documents say and shows you where it says it.
            It is not legal, financial or compliance advice, and it does not guarantee that an
            award has been read completely or complied with.
          </p>
        </div>
      </div>
    </footer>
  );
}
