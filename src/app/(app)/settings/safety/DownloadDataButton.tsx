"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

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

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await exportAccountData();
      if (!result.ok || !result.data) {
        setError(result.formError ?? "Could not prepare your data export.");
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

      toast({ title: "Your data export has downloaded.", tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-fg">Download my data</h2>
      <p className="text-sm text-fg-muted">
        Get a JSON file with your profile, your Waves&apos; metadata, and your comments.
      </p>
      <div>
        <Button
          variant="secondary"
          leadingIcon={<Download className="size-4" />}
          onClick={handleDownload}
          loading={isPending}
        >
          Download my data
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
