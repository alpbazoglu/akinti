"use client";

import { useState, useTransition, type FormEvent } from "react";

import { updateAccount } from "@/app/(app)/settings/actions";
import { useCurrentUser } from "@/lib/auth";
import { Button, Input, Textarea, useToast } from "@/components/ui";

import { AvatarUploader } from "./AvatarUploader";

export interface AccountFormProps {
  initialUsername: string;
  initialDisplayName: string | null;
  initialBio: string | null;
  initialAvatarUrl: string | null;
}

const BIO_MAX_LENGTH = 500;

/** Settings → Account (spec §25): avatar, display name, username, bio. */
export function AccountForm({
  initialUsername,
  initialDisplayName,
  initialBio,
  initialAvatarUrl,
}: AccountFormProps) {
  const { refreshProfile } = useCurrentUser();
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const result = await updateAccount({
        username,
        displayName: displayName.trim().length > 0 ? displayName.trim() : null,
        bio: bio.trim().length > 0 ? bio.trim() : null,
      });

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      await refreshProfile();
      toast({ title: result.message ?? "Saved.", tone: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <AvatarUploader initialAvatarUrl={initialAvatarUrl} name={displayName || username} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          id="account-display-name"
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={50}
          error={fieldErrors.display_name}
        />
        <Input
          id="account-username"
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          maxLength={30}
          required
          hint="Lowercase letters, numbers and underscores only."
          error={fieldErrors.username}
        />
        <Textarea
          id="account-bio"
          label="Bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={BIO_MAX_LENGTH}
          showCount
          error={fieldErrors.bio}
        />
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" loading={isPending} className="self-start">
          Save changes
        </Button>
      </form>
    </div>
  );
}
