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
              <span className="type-subhead">AwardLens</span>
            </div>
            <p className="type-small mt-3 text-muted-foreground">
              Post-award grant management for small nonprofits. Upload an award, get a
              source-linked register of what was promised, and confirm every item yourself.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="eyebrow text-muted-foreground">{column.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="type-small rounded-sm text-foreground-soft transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/*
          The limits of the product are the last thing a visitor reads, and they
          are set at reading size in body ink rather than as 12px grey fine
          print. A disclaimer nobody can read is not a disclaimer.
        */}
        <div className="mt-14 grid gap-5 border-t border-border pt-7 md:grid-cols-[1fr_auto] md:items-start md:gap-12">
          <p className="type-small measure-wide text-foreground-soft">
            AwardLens organises what your award documents say and shows you where it says it.
            It is not legal, financial or compliance advice, and it does not guarantee that an
            award has been read completely or complied with.
          </p>
          <p className="type-caption text-muted-foreground md:text-right">
            &copy; {year} AwardLens. Every extracted item cites its source; a person confirms it.
          </p>
        </div>
      </div>
    </footer>
  );
}
