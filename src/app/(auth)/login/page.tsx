import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { LoginForm } from "./LoginForm";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  return { title: t("logIn") };
}

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LogInPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const t = await getTranslations("LoginPage");
  const tTerms = await getTranslations("Terms");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">{tTerms("logIn")}</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="type-body-sm measure text-ink-muted">{t("signInDescription")}</p>
          <LoginForm next={next} initialError={error === "callback_failed" ? t("callbackErrorMessage") : undefined} />
        </>
      ) : (
        <EmptyState size="sm" title={t("notConnectedTitle")} description={t("notConnectedDescription")} />
      )}
    </div>
  );
}
