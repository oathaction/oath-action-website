"use client";

import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/navigation";

/**
 * The account control in the application header.
 *
 * The trigger draws the initial of the signed-in address rather than a generic
 * person glyph: on a product where two people at the same nonprofit share a
 * laptop, "who am I signed in as" is a question the chrome should answer
 * without being opened. The accessible name still carries the full address, so
 * nothing is lost to anyone reading the page rather than looking at it.
 */
export function SignOutButton({
  email,
  organizationName,
}: {
  email: string;
  organizationName?: string;
}) {
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 items-center justify-center rounded-full border border-border-control bg-surface text-[13px] font-semibold text-foreground-soft shadow-xs transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Account menu for ${email}`}
      >
        <span aria-hidden="true">{initial}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {organizationName ? (
          <DropdownMenuLabel>{organizationName}</DropdownMenuLabel>
        ) : null}
        <div className="max-w-56 truncate px-2.5 pb-2 pt-1 text-sm text-foreground">{email}</div>
        <DropdownMenuSeparator />

        {/*
          The form wraps the menu item rather than sitting inside it, and the
          item's default select behaviour is suppressed.

          Radix closes the menu synchronously on select, which unmounts the
          portalled content. If the form lives inside the item, it is detached
          from the document before the submit event dispatches and the browser
          cancels the submission — sign-out silently does nothing. Keeping the
          menu open until the server action's redirect navigates away avoids
          that entirely, and the plain form submit still works without JS.
        */}
        <form action={signOutAction}>
          <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
            <button type="submit" className="w-full">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
