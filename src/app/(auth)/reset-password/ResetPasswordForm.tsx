"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState, type FormEvent } from "react";

import { updatePassword } from "../actions";
import { routes } from "@/config/routes";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, EmptyState, Input } from "@/components/ui";

export function ResetPasswordForm() {
  const t = useTranslations("ResetPasswordForm");
  const [state, formAction, isPending] = useActionState(updatePassword, AUTH_ACTION_INITIAL_STATE);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (state.ok && state.message) {
    return (
      <div>
        <EmptyState
          size="sm"
          title={t("passwordUpdated")}
          description={state.message}
          action={
            <Link href={routes.home()} className="text-sm font-medium text-accent underline underline-offset-2">
              {t("continueAction")}
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
      setConfirmError(t("passwordsDoNotMatch"));
      return;
    }
    setConfirmError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-fg-muted">{t("chooseNewPassword")}</p>
      <Input
        id="password"
        name="password"
        type="password"
        label={t("newPassword")}
        autoComplete="new-password"
        hint={t("passwordHint")}
        required
        error={state.fieldErrors?.password}
      />
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={t("confirmNewPassword")}
        autoComplete="new-password"
        required
        error={confirmError}
      />

      {state.formError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel={t("updating")} fullWidth>
        {t("updatePassword")}
      </Button>
    </form>
  );
}
