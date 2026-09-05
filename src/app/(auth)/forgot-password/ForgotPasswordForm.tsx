"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset } from "../actions";
import { routes } from "@/config/routes";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, EmptyState, Input } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, AUTH_ACTION_INITIAL_STATE);

  if (state.ok && state.message) {
    return (
      <div>
        <EmptyState
          size="sm"
          title="Check your email"
          description={state.message}
          action={
            <Link href={routes.login()} className="text-sm font-medium text-accent underline underline-offset-2">
              Back to log in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-fg-muted">
        Enter the email on your account and we will send you a link to reset your password.
      </p>
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      {state.formError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel="Sending" fullWidth>
        Send reset link
      </Button>

      <p className="text-center text-sm text-fg-muted">
        <Link
          href={routes.login()}
          className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Back to log in
        </Link>
      </p>
    </form>
  );
}
