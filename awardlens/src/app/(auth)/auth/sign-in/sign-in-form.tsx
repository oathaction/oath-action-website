"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Mail, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  requestLoginCode,
  verifyLoginCode,
  type AuthState,
} from "@/app/actions/auth";

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
    <form action={formAction} className="stack-lg">
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
    <form action={formAction} className="stack-lg">
      <input type="hidden" name="email" value={state.email} />

      <p className="text-[13px] leading-relaxed text-muted-foreground empty:hidden" role="status">
        {state.status === "code_sent" && state.message ? state.message : null}
      </p>

      {requested.devCode ? (
        <Alert variant="warning" icon={<TriangleAlert />}>
          <AlertDescription>
            <p className="font-semibold">Development mode — email is not being sent.</p>
            <p className="mt-1.5 text-[13px]">
              Your code is{" "}
              <span className="metric font-mono text-base tracking-[0.28em] text-warning">
                {requested.devCode}
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">
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
          aria-invalid={state.status === "error" || undefined}
          className="h-12 text-center font-mono text-xl tracking-[0.4em]"
        />
        {state.status === "error" ? <FieldError>{state.message}</FieldError> : null}
      </Field>

      <SubmitButton>
        <KeyRound className="size-4" aria-hidden="true" />
        Sign in
      </SubmitButton>

      <p className="text-center text-xs text-muted-foreground">
        Didn&rsquo;t get it? Check spam, or{" "}
        <a
          href="/auth/sign-in"
          className="font-medium underline underline-offset-2 hover:text-foreground"
        >
          start again
        </a>
        .
      </p>
    </form>
  );
}
