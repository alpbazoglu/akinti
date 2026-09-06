"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ChangeEvent } from "react";

import { updateAvatar } from "@/app/(app)/settings/actions";
import { useCurrentUser } from "@/lib/auth";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
  avatarPath,
} from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Avatar, Button, useToast } from "@/components/ui";

export interface AvatarUploaderProps {
  initialAvatarUrl: string | null;
  name: string;
  className?: string;
}

const MAX_DIMENSION_PX = 512;
const JPEG_QUALITY = 0.88;

function isAllowedAvatarMimeType(value: string): boolean {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Resize an image client-side to at most 512×512 via `<canvas>`, so a photo
 * straight from a phone camera never uploads at full resolution (spec §33 —
 * this stays a modest, world-readable image, not an arbitrary file).
 * Re-encodes as JPEG regardless of source format for a predictable, small
 * output.
 */
async function resizeToJpeg(file: File, maxDimension: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("This browser cannot process images.");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not process that image."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Avatar upload (spec §25/§33): client-side validation + resize, direct
 * upload to the public `avatars` bucket (owner-writable via the storage
 * policy in migration 13, so no server round-trip is needed for the file
 * itself), then a Server Action persists the resulting public URL on the
 * profile row.
 */
export function AvatarUploader({ initialAvatarUrl, name, className }: AvatarUploaderProps) {
  const { user, refreshProfile } = useCurrentUser();
  const t = useTranslations("AvatarUploader");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;

    setError(null);

    if (!isSupabaseConfigured()) {
      setError(t("backendNotConfigured"));
      return;
    }
    if (!user) {
      setError(t("sessionExpired"));
      return;
    }
    if (!isAllowedAvatarMimeType(file.type)) {
      setError(t("invalidType"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(t("tooLarge", { mb: Math.round(MAX_AVATAR_BYTES / (1024 * 1024)) }));
      return;
    }

    startTransition(async () => {
      try {
        const resized = await resizeToJpeg(file, MAX_DIMENSION_PX, JPEG_QUALITY);
        const supabase = createClient();
        const path = avatarPath(user.id, `avatar-${Date.now()}.jpg`);

        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, resized, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

        const result = await updateAvatar(data.publicUrl);
        if (!result.ok) {
          setError(result.formError ?? t("couldNotSaveNewPhoto"));
          return;
        }

        setPreview(data.publicUrl);
        await refreshProfile();
        toast({ title: result.message ?? t("profilePhotoUpdated"), tone: "success" });
      } catch {
        setError(t("couldNotUpload"));
      }
    });
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <Avatar name={name} src={preview} size="xl" />
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_AVATAR_MIME_TYPES.join(",")}
            onChange={handleFileChange}
            className="sr-only"
            aria-label={t("uploadLabel")}
          />
          <Button type="button" variant="secondary" size="sm" onClick={handlePick} loading={isPending}>
            {t("changePhoto")}
          </Button>
          <p className="text-xs text-fg-subtle">
            {t("hint", { px: MAX_DIMENSION_PX })}
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
