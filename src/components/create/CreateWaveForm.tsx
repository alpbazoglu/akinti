"use client";

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
import { CREATION_TYPES, TERMS } from "@/config/terminology";
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

const VISIBILITY_LABELS: Record<WaveVisibility, string> = {
  everyone: "Everyone",
  followers: TERMS.followers,
  only_me: "Only me",
};

const PERMISSION_LABELS: Record<PermissionAudience, string> = {
  everyone: "Everyone",
  followers: TERMS.followers,
  following: TERMS.following,
  nobody: "Nobody",
};

const VISIBILITY_OPTIONS: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

const PERMISSION_OPTIONS_WITH_DEFAULT: SelectOption[] = [
  { value: "", label: "Use my profile default" },
  ...PERMISSION_AUDIENCES.map((value) => ({ value, label: PERMISSION_LABELS[value] })),
];

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
  const idPrefix = useId();
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
      setTitleError("Give this Wave a title.");
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
          <Badge>{creationMeta.label}</Badge>
          {backingTrackTitle ? <Badge>Over {backingTrackTitle}</Badge> : null}
        </div>
      </div>

      <Input
        id={`${idPrefix}-title`}
        label="Title"
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
        label="What is this?"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={DESCRIPTION_MAX_LENGTH}
        showCount
      />

      {showOpenCall ? (
        <div className="border-t border-hairline pt-4">
          <Switch
            label={TERMS.openForDuet}
            description="Anyone can ask to record with this."
            checked={openCall === true}
            onCheckedChange={(next) => onOpenCallChange?.(next)}
          />
        </div>
      ) : null}

      <Select
        id={`${idPrefix}-visibility`}
        label="Who can hear it"
        value={visibility}
        onChange={(event) => setVisibility(event.target.value as WaveVisibility)}
        options={VISIBILITY_OPTIONS}
        hint="This controls who can open it, not just what is shown."
      />

      <Select
        id={`${idPrefix}-comment-permission`}
        label="Who can comment"
        value={commentPermission ?? ""}
        onChange={(event) =>
          setCommentPermission((event.target.value || null) as PermissionAudience | null)
        }
        options={PERMISSION_OPTIONS_WITH_DEFAULT}
      />

      <Select
        id={`${idPrefix}-duet-permission`}
        label={`Who can ${TERMS.requestDuet.toLowerCase()}`}
        value={duetPermission ?? ""}
        onChange={(event) =>
          setDuetPermission((event.target.value || null) as PermissionAudience | null)
        }
        options={PERMISSION_OPTIONS_WITH_DEFAULT}
      />

      <div className="flex flex-col gap-2">
        <Input
          id={`${idPrefix}-collaborators`}
          label={TERMS.collaborators}
          value={collaboratorInput}
          onChange={(event) => setCollaboratorInput(event.target.value)}
          onKeyDown={handleCollaboratorKeyDown}
          onBlur={addCollaborator}
          hint="A username at a time. They accept before they are credited."
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
                aria-label={`Remove ${username}`}
              >
                @{username}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="type-caption-strong text-ink-muted">Tags</span>
        <div role="group" aria-label="Tags" className="flex flex-wrap gap-2">
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

      <Button type="submit" size="lg" loading={submitting} loadingLabel="Publishing" fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}
