"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { signIn } from "../actions";
import { routes } from "@/config/routes";
import { useAuthRedirect } from "@/lib/auth";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, Input } from "@/components/ui";

export interface LoginFormProps {
  /** Where to return after signing in — carried through from `?next=`. */
  next?: string;
  /** Static banner for a failed `/auth/callback` exchange (expired/used link). */
  initialError?: string;
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const t = useTranslations("LoginForm");
  const tTerms = useTranslations("Terms");
  const [state, formAction, isPending] = useActionState(signIn, AUTH_ACTION_INITIAL_STATE);
  useAuthRedirect(state);
  // A successful sign-in already triggered `useAuthRedirect`'s hard
  // navigation above; keep the button in its loading state through that
  // handoff instead of flashing back to "Log in" for the instant before
  // the browser actually leaves this page.
  const isRedirecting = state.ok && Boolean(state.redirectTo);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {initialError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {initialError}
        </p>
      ) : null}

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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      {state.formError ? (
        <p role="alert" className="type-body-sm text-signal-deep">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending || isRedirecting} loadingLabel={t("signingIn")} fullWidth>
        {tTerms("logIn")}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link
          href={routes.forgotPassword()}
          className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("forgotPassword")}
        </Link>
        <Link
          href={routes.signup()}
          className="text-fg-muted underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("createAnAccount")}
        </Link>
      </div>
    </form>
  );
}
