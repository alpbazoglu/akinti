import { getTranslations } from "next-intl/server";

import { RouteLoading, Skeleton } from "@/components/ui";

export default async function CreateLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading
      label={t("routeLoading")}
      className="akinti-page flex flex-col items-center gap-6 pt-16"
    >
      <Skeleton shape="circle" className="size-16 rounded-[22px]" />
      <Skeleton shape="waterline" className="w-full max-w-md" />
    </RouteLoading>
  );
}
