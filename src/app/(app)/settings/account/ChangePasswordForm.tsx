"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";

import { updatePassword } from "@/app/(auth)/actions";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, Input, useToast } from "@/components/ui";

/** Change-password form for a fully signed-in user (spec §25 — Account). */
export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePassword, AUTH_ACTION_INITIAL_STATE);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const { toast } = useToast();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    if (formData.get("password") !== formData.get("confirmPassword")) {
      event.preventDefault();
      setConfirmError("Passwords do not match.");
      return;
    }
    setConfirmError(null);
  }

  useEffect(() => {
    if (state.ok && state.message) {
      toast({ title: state.message, tone: "success" });
    }
    // Fire only when a fresh action result arrives, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        id="account-password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        error={state.fieldErrors?.password}
      />
      <Input
        id="account-confirm-password"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={confirmError}
      />
      {state.formError ? (
        <p role="alert" className="text-sm text-danger">
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" loading={isPending} loadingLabel="Updating" className="self-start">
        Update password
      </Button>
    </form>
  );
}
