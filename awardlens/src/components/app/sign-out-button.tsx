"use client";

import { LogOut, UserRound } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/navigation";

export function SignOutButton({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground-soft transition-colors hover:bg-muted"
        aria-label={`Account menu for ${email}`}
      >
        <UserRound className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="max-w-52 truncate font-normal text-foreground">
          {email}
        </DropdownMenuLabel>
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
