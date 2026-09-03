"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp } from "../actions";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { AUTH_ACTION_INITIAL_STATE } from "@/lib/auth/types";
import { Button, EmptyState, Input } from "@/components/ui";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUp, AUTH_ACTION_INITIAL_STATE);

  if (state.ok && state.message) {
    return (
      <div className="px-5 py-5">
        <EmptyState
          size="sm"
          title="Check your email"
          description={state.message}
          action={
            <Link href={routes.login()} className="text-sm font-medium text-accent underline underline-offset-2">
              Go to log in
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 px-5 py-5" noValidate>
      <Input
        id="username"
        name="username"
        type="text"
        label="Username"
        autoComplete="username"
        hint="Lowercase letters, numbers and underscores. 3–30 characters."
        required
        error={state.fieldErrors?.username}
      />
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
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        error={state.fieldErrors?.password}
      />

      {state.formError ? (
        <p role="alert" className="text-sm text-danger">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" loading={isPending} loadingLabel="Creating account" fullWidth>
        {TERMS.signUp}
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link
          href={routes.login()}
          className="text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {TERMS.logIn}
        </Link>
      </p>
    </form>
  );
}
