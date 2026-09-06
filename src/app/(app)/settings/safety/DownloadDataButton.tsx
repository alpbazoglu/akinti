"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Download } from "@/components/ui/icons";

import { exportAccountData } from "@/app/(app)/settings/actions";
import { Button, useToast } from "@/components/ui";
import { accountDataExportFilename } from "@/lib/privacy/dataExport";

/**
 * Settings → Safety → "Download my data" (spec §25/§26). A real export: the
 * Server Action returns the shaped JSON document
 * (`src/lib/privacy/dataExport.ts`), and this component is the one place
 * that turns it into a file the browser actually saves — a Server Action
 * cannot hand back a `Blob` across the RSC boundary.
 */
export function DownloadDataButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const t = useTranslations("DownloadDataButton");

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await exportAccountData();
      if (!result.ok || !result.data) {
        setError(result.formError ?? t("couldNotPrepare"));
        return;
      }

      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = accountDataExportFilename(result.data.profile.username);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast({ title: t("exportDownloaded"), tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-5">
      <p className="type-body-sm text-ink-muted">
        {t("description")}
      </p>
      <div>
        <Button
          variant="secondary"
          leadingIcon={<Download className="size-4" />}
          onClick={handleDownload}
          loading={isPending}
        >
          {t("downloadButton")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
