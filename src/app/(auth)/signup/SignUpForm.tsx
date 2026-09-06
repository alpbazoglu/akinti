"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { signUp } from "../actions";
import { routes } from "@/config/routes";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, EmptyState, Input } from "@/components/ui";

export function SignUpForm() {
  const t = useTranslations("SignUpForm");
  const tTerms = useTranslations("Terms");
  const [state, formAction, isPending] = useActionState(signUp, AUTH_ACTION_INITIAL_STATE);

  if (state.ok && state.message) {
    return (
      <div>
        <EmptyState
          size="sm"
          title={t("checkYourEmail")}
          description={state.message}
          action={
            <Link href={routes.login()} className="text-sm font-medium text-accent underline underline-offset-2">
              {t("goToLogIn")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <Input
        id="username"
        name="username"
        type="text"
        label={t("username")}
        autoComplete="username"
        hint={t("usernameHint")}
        required
        error={state.fieldErrors?.username}
      />
      <Input
        id="email"
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Input
        id="password"
        name="password"
        type="password"
        label={t("password")}
        autoComplete="new-password"
        hint={t("passwordHint")}
        required
        error={state.fieldErrors?.password}
      />

      {state.formError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel={t("creatingAccount")} fullWidth>
        {tTerms("signUp")}
      </Button>

      <p className="text-center text-sm text-fg-muted">
        {t("alreadyHaveAnAccount")}{" "}
        <Link
          href={routes.login()}
          className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {tTerms("logIn")}
        </Link>
      </p>
    </form>
  );
}
