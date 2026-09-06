"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";

import { X } from "@/components/ui/icons";
import {
  WAVE_CATEGORY_OPTIONS,
  type CreateWaveDraft,
  type CreateWaveDraftAudio,
} from "@/lib/audio/createDraft";
import {
  PERMISSION_AUDIENCES,
  WAVE_VISIBILITIES,
  type PermissionAudience,
  type WaveVisibility,
} from "@/types/domain";
import { Badge, Button, Chip, Input, Select, Switch, Textarea, type SelectOption } from "@/components/ui";
import { CREATION_TYPES } from "@/config/terminology";
import { cn } from "@/lib/ui";

import { TakeStrip } from "./TakeStrip";

export interface CreateWaveFormProps {
  /** The captured audio from the earlier steps — shown here, never uploaded here. */
  audio: CreateWaveDraftAudio;
  onSubmit: (draft: CreateWaveDraft) => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Title of the backing track this take was sung over, when there was one. */
  backingTrackTitle?: string | null;
  /**
   * "Open for Duet". Omitted entirely when the caller has nowhere to send it:
   * a switch that silently does nothing is worse than no switch.
   */
  openCall?: boolean;
  onOpenCallChange?: (open: boolean) => void;
  className?: string;
}

const TITLE_MAX_LENGTH = 140;
const DESCRIPTION_MAX_LENGTH = 280;
const MAX_COLLABORATORS = 8;

function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Details (`docs/design/SCREENS.md` §4.5, spec §11, §16, §21).
 *
 * The take pins to the top as a 32px strip so the form is always about a
 * specific piece of audio. How it was made is stated, not asked: the creation
 * type is derived from how you got here and shown as a hairline tag (§8.11),
 * never as a question.
 *
 * Presentation and local state only — no server calls. On submit it assembles
 * a typed `CreateWaveDraft` and hands it to `onSubmit`, which is where
 * `CreateFlow` runs the real publish sequence.
 */
export function CreateWaveForm({
  audio,
  onSubmit,
  submitting = false,
  submitLabel = "Publish",
  backingTrackTitle,
  openCall,
  onOpenCallChange,
  className,
}: CreateWaveFormProps) {
  const t = useTranslations("CreateWaveForm");
  const tTerms = useTranslations("Terms");
  const idPrefix = useId();

  const visibilityOptions: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
    value,
    label: value === "everyone" ? t("everyone") : value === "followers" ? tTerms("followers") : t("onlyMe"),
  }));

  const permissionOptionsWithDefault: SelectOption[] = [
    { value: "", label: t("useMyProfileDefault") },
    ...PERMISSION_AUDIENCES.map((value) => ({
      value,
      label:
        value === "everyone"
          ? t("everyone")
          : value === "followers"
            ? tTerms("followers")
            : value === "following"
              ? tTerms("following")
              : t("nobody"),
    })),
  ];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<WaveVisibility>("everyone");
  const [commentPermission, setCommentPermission] = useState<PermissionAudience | null>(null);
  const [duetPermission, setDuetPermission] = useState<PermissionAudience | null>(null);
  const [collaboratorInput, setCollaboratorInput] = useState("");
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);

  const creationMeta = CREATION_TYPES[audio.creationType];
  const showOpenCall = typeof openCall === "boolean" && Boolean(onOpenCallChange);

  const addCollaborator = () => {
    const username = normaliseUsername(collaboratorInput);
    setCollaboratorInput("");
    if (!username) return;
    if (collaborators.includes(username) || collaborators.length >= MAX_COLLABORATORS) return;
    setCollaborators((current) => [...current, username]);
  };

  const removeCollaborator = (username: string) => {
    setCollaborators((current) => current.filter((item) => item !== username));
  };

  const toggleCategory = (category: string) => {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const handleCollaboratorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addCollaborator();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(t("giveThisWaveATitle", { wave: tTerms("wave") }));
      return;
    }
    setTitleError(null);

    onSubmit({
      audio,
      title: trimmedTitle,
      description: description.trim(),
      visibility,
      commentPermission,
      duetPermission,
      collaboratorUsernames: collaborators,
      categories,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-6", className)} noValidate>
      <div className="flex flex-col gap-3 border-b border-hairline pb-4">
        <TakeStrip blob={audio.blob} peaks={audio.previewPeaks} durationMs={audio.durationMs} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{tTerms(creationMeta.id)}</Badge>
          {backingTrackTitle ? <Badge>{t("over", { title: backingTrackTitle })}</Badge> : null}
        </div>
      </div>

      <Input
        id={`${idPrefix}-title`}
        label={t("titleLabel")}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          if (titleError) setTitleError(null);
        }}
        maxLength={TITLE_MAX_LENGTH}
        error={titleError}
        required
      />

      <Textarea
        id={`${idPrefix}-description`}
        label={t("whatIsThis")}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={DESCRIPTION_MAX_LENGTH}
        showCount
      />

      {showOpenCall ? (
        <div className="border-t border-hairline pt-4">
          <Switch
            label={tTerms("openForDuet")}
            description={t("openForDuetDescription")}
            checked={openCall === true}
            onCheckedChange={(next) => onOpenCallChange?.(next)}
          />
        </div>
      ) : null}

      <Select
        id={`${idPrefix}-visibility`}
        label={t("whoCanHearIt")}
        value={visibility}
        onChange={(event) => setVisibility(event.target.value as WaveVisibility)}
        options={visibilityOptions}
        hint={t("visibilityHint")}
      />

      <Select
        id={`${idPrefix}-comment-permission`}
        label={t("whoCanComment")}
        value={commentPermission ?? ""}
        onChange={(event) =>
          setCommentPermission((event.target.value || null) as PermissionAudience | null)
        }
        options={permissionOptionsWithDefault}
      />

      <Select
        id={`${idPrefix}-duet-permission`}
        label={t("whoCanRequestDuet", { duet: tTerms("duet") })}
        value={duetPermission ?? ""}
        onChange={(event) =>
          setDuetPermission((event.target.value || null) as PermissionAudience | null)
        }
        options={permissionOptionsWithDefault}
      />

      <div className="flex flex-col gap-2">
        <Input
          id={`${idPrefix}-collaborators`}
          label={tTerms("collaborators")}
          value={collaboratorInput}
          onChange={(event) => setCollaboratorInput(event.target.value)}
          onKeyDown={handleCollaboratorKeyDown}
          onBlur={addCollaborator}
          hint={t("collaboratorsHint")}
          disabled={collaborators.length >= MAX_COLLABORATORS}
        />
        {collaborators.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {collaborators.map((username) => (
              <Chip
                key={username}
                selected
                icon={<X className="size-3.5" />}
                onClick={() => removeCollaborator(username)}
                aria-label={t("removeUsername", { username })}
              >
                @{username}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="type-caption-strong text-ink-muted">{t("tags")}</span>
        <div role="group" aria-label={t("tags")} className="flex flex-wrap gap-2">
          {WAVE_CATEGORY_OPTIONS.map((category) => (
            <Chip
              key={category}
              selected={categories.includes(category)}
              onClick={() => toggleCategory(category)}
            >
              {category}
            </Chip>
          ))}
        </div>
      </div>

      <Button type="submit" size="lg" loading={submitting} loadingLabel={t("publishing")} fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}
