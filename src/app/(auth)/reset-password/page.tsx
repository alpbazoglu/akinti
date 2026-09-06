import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { getCurrentUser } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { ResetPasswordForm } from "./ResetPasswordForm";

export async function generateMetadata() {
  const t = await getTranslations("ResetPasswordPage");
  return { title: t("title") };
}

export default async function ResetPasswordPage() {
  const configured = isSupabaseConfigured();
  const user = configured ? await getCurrentUser() : null;
  const t = await getTranslations("ResetPasswordPage");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-ink">{t("title")}</h1>
      {!configured ? (
        <EmptyState size="sm" title={t("notConnectedTitle")} description={t("notConnectedDescription")} />
      ) : user ? (
        <ResetPasswordForm />
      ) : (
        <EmptyState
          size="sm"
          title={t("linkExpiredTitle")}
          description={t("linkExpiredDescription")}
          action={
            <Link
              href={routes.forgotPassword()}
              className="text-sm font-medium text-accent underline underline-offset-2"
            >
              {t("requestNewLink")}
            </Link>
          }
        />
      )}
    </div>
  );
}
