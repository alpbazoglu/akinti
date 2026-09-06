import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export async function generateMetadata() {
  const t = await getTranslations("ForgotPasswordPage");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("ForgotPasswordPage");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">{t("title")}</h1>
      {isSupabaseConfigured() ? (
        <ForgotPasswordForm />
      ) : (
        <EmptyState size="sm" title={t("notConnectedTitle")} description={t("notConnectedDescription")} />
      )}
    </div>
  );
}
