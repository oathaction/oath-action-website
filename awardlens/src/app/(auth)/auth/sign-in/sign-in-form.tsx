"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  requestLoginCode,
  verifyLoginCode,
  type AuthState,
} from "@/app/actions/auth";

// [E2E SCRATCH PATCH — TO BE REVERTED]
const initialAuthState: AuthState = { status: "idle", email: "", message: null };

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    requestLoginCode,
    initialAuthState,
  );

  if (state.status === "code_sent") {
    return <VerifyForm requested={state} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field>
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="you@yourorganisation.org"
          aria-describedby="email-hint"
          aria-invalid={state.status === "error" || undefined}
        />
        <FieldHint id="email-hint">
          Use your work address so your organisation is set up correctly.
        </FieldHint>
        {state.status === "error" ? <FieldError>{state.message}</FieldError> : null}
      </Field>

      <SubmitButton>
        <Mail className="size-4" aria-hidden="true" />
        Email me a code
      </SubmitButton>
    </form>
  );
}

function VerifyForm({ requested }: { requested: AuthState }) {
  const [state, formAction] = useActionState<AuthState, FormData>(verifyLoginCode, requested);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="email" value={state.email} />

      <p className="text-sm text-foreground-soft" role="status">
        {state.status === "code_sent" && state.message ? state.message : null}
      </p>

      {requested.devCode ? (
        <Alert variant="warning">
          <AlertDescription>
            <p className="font-semibold">Development mode — email is not being sent.</p>
            <p className="mt-1">
              Your code is{" "}
              <span className="font-mono text-base tracking-widest">{requested.devCode}</span>
            </p>
            <p className="mt-1 text-xs">
              Configure RESEND_API_KEY to deliver real email. Codes are never shown on screen in a
              production build.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Field>
        <Label htmlFor="code">Six-digit code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          className="text-center font-mono text-lg tracking-[0.4em]"
          aria-invalid={state.status === "error" || undefined}
        />
        {state.status === "error" ? <FieldError>{state.message}</FieldError> : null}
      </Field>

      <SubmitButton>
        <KeyRound className="size-4" aria-hidden="true" />
        Sign in
      </SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        Didn&rsquo;t get it? Check spam, or{" "}
        <a href="/auth/sign-in" className="underline underline-offset-2 hover:text-foreground">
          start again
        </a>
        .
      </p>
    </form>
  );
}
