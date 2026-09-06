"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { requestPasswordReset } from "../actions";
import { routes } from "@/config/routes";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, EmptyState, Input } from "@/components/ui";

export function ForgotPasswordForm() {
  const t = useTranslations("ForgotPasswordForm");
  const [state, formAction, isPending] = useActionState(requestPasswordReset, AUTH_ACTION_INITIAL_STATE);

  if (state.ok && state.message) {
    return (
      <div>
        <EmptyState
          size="sm"
          title={t("checkYourEmail")}
          description={state.message}
          action={
            <Link href={routes.login()} className="text-sm font-medium text-accent underline underline-offset-2">
              {t("backToLogIn")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-fg-muted">{t("enterEmailDescription")}</p>
      <Input
        id="email"
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      {state.formError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel={t("sending")} fullWidth>
        {t("sendResetLink")}
      </Button>

      <p className="text-center text-sm text-fg-muted">
        <Link
          href={routes.login()}
          className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("backToLogIn")}
        </Link>
      </p>
    </form>
  );
}
