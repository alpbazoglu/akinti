"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";

import { updatePassword } from "../actions";
import { routes } from "@/config/routes";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, EmptyState, Input } from "@/components/ui";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePassword, AUTH_ACTION_INITIAL_STATE);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (state.ok && state.message) {
    return (
      <div>
        <EmptyState
          size="sm"
          title="Password updated"
          description={state.message}
          action={
            <Link href={routes.home()} className="text-sm font-medium text-accent underline underline-offset-2">
              Continue
            </Link>
          }
        />
      </div>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");
    if (password !== confirmPassword) {
      event.preventDefault();
      setConfirmError("Passwords do not match.");
      return;
    }
    setConfirmError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-fg-muted">Choose a new password for your account.</p>
      <Input
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        error={state.fieldErrors?.password}
      />
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={confirmError}
      />

      {state.formError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel="Updating" fullWidth>
        Update password
      </Button>
    </form>
  );
}
