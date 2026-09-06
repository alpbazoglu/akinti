import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { SignUpForm } from "./SignUpForm";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  return { title: t("signUp") };
}

export default async function SignUpPage() {
  const t = await getTranslations("SignUpPage");
  const tTerms = await getTranslations("Terms");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">{tTerms("signUp")}</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="type-body-sm measure text-ink-muted">{t("createAccountDescription")}</p>
          <SignUpForm />
        </>
      ) : (
        <EmptyState size="sm" title={t("notConnectedTitle")} description={t("notConnectedDescription")} />
      )}
    </div>
  );
}
