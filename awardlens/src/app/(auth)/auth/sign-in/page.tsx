import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to AwardLens with a one-time code sent to your email.",
};

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <main id="main" className="flex min-h-dvh flex-col">
      <header className="container-page py-6">
        <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
          AwardLens
        </Link>
      </header>

      <div className="container-page flex flex-1 items-start justify-center pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We&rsquo;ll email you a six-digit code. No password to remember.
          </p>

          <div className="mt-6 rounded-lg border border-border bg-surface p-6">
            <SignInForm />
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            By signing in you agree that AwardLens is a workflow tool and does not provide legal,
            accounting, tax or compliance advice. Always check requirements against your award
            document.
          </p>
        </div>
      </div>
    </main>
  );
}
