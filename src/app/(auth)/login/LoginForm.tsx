"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "../actions";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, Input } from "@/components/ui";

export interface LoginFormProps {
  /** Where to return after signing in — carried through from `?next=`. */
  next?: string;
  /** Static banner for a failed `/auth/callback` exchange (expired/used link). */
  initialError?: string;
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signIn, AUTH_ACTION_INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4 px-5 py-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {initialError ? (
        <p role="alert" className="text-sm text-danger">
          {initialError}
        </p>
      ) : null}

      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      {state.formError ? (
        <p role="alert" className="text-sm text-danger">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel="Signing in" fullWidth>
        {TERMS.logIn}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link
          href={routes.forgotPassword()}
          className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Forgot password?
        </Link>
        <Link
          href={routes.signup()}
          className="text-fg-muted underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Create an account
        </Link>
      </div>
    </form>
  );
}
