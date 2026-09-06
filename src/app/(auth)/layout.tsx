import type { ReactNode } from "react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";
import { pickMessages } from "@/i18n/pickMessages";

/**
 * Every namespace `useTranslations`/`getTranslations` is called with
 * anywhere under `(auth)/**` — login, signup, forgot/reset password, their
 * form components, and this layout's own `Terms.tagline` — verified by
 * grep, not guessed (review3 finding 12; see `pickMessages`'s doc comment
 * for why this list has to be self-sufficient rather than additive to the
 * root layout's smaller set).
 */
const AUTH_MESSAGE_NAMESPACES = [
  "Terms",
  "LoginPage",
  "LoginForm",
  "SignUpPage",
  "SignUpForm",
  "ForgotPasswordPage",
  "ForgotPasswordForm",
  "ResetPasswordPage",
  "ResetPasswordForm",
] as const;

/** Minimal centred layout for sign-in, sign-up and onboarding. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [t, messages] = await Promise.all([getTranslations("Terms"), getMessages()]);
  const authMessages = pickMessages(messages, AUTH_MESSAGE_NAMESPACES);

  return (
    <NextIntlClientProvider messages={authMessages}>
      <div className="akinti-page flex min-h-dvh flex-col justify-center py-10">
        <main id="main" className="w-full max-w-sm">
          <div className="mb-10 flex flex-col items-start gap-2">
            <Link
              href={routes.home()}
              className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="type-wordmark text-ink">{BRAND}</span>
            </Link>
            <p className="type-body-sm measure text-ink-muted">{t("tagline")}</p>
          </div>
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
