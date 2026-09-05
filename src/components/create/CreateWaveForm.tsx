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
import { Button, Chip, Input, Select, Textarea, type SelectOption } from "@/components/ui";
import { CREATION_TYPES, TERMS } from "@/config/terminology";
import { cn } from "@/lib/ui";

export interface CreateWaveFormProps {
  /** The captured/enhanced audio from the earlier steps — presentation only, never uploaded here. */
  audio: CreateWaveDraftAudio;
  /** Receives the assembled draft. Wiring this to a server call is the next agent's job. */
  onSubmit: (draft: CreateWaveDraft) => void;
  submitting?: boolean;
  submitLabel?: string;
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
 * Wave creation details: title, description, visibility, comment/Duet
 * permissions, collaborators, category (spec §11, §16, §21). Presentation
 * and local state only — no server calls. On submit, assembles a typed
 * `CreateWaveDraft` (see `lib/audio/createDraft.ts`) and hands it to the
 * caller's `onSubmit`, which is where the server-side agent wires publishing.
 */
export function CreateWaveForm({
  audio,
  onSubmit,
  submitting = false,
  submitLabel = "Publish",
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
      setTitleError(`Give this ${TERMS.wave.toLowerCase()} a title.`);
      return;
    }
    setTitleError(null);

    const draft: CreateWaveDraft = {
      audio,
      title: trimmedTitle,
      description: description.trim(),
      visibility,
      commentPermission,
      duetPermission,
      collaboratorUsernames: collaborators,
      categories,
    };
    onSubmit(draft);
  };

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-5", className)} noValidate>
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <span aria-hidden="true">{creationMeta.glyph}</span>
        <span>{creationMeta.label}</span>
      </div>

      <Input
        id={`${idPrefix}-title`}
        label="Title"
        placeholder={`Give this ${TERMS.wave.toLowerCase()} a name`}
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
        label="Description"
        placeholder="Say something about this recording (optional)"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={DESCRIPTION_MAX_LENGTH}
        showCount
      />

      <Select
        id={`${idPrefix}-visibility`}
        label={`${TERMS.wave} visibility`}
        value={visibility}
        onChange={(event) => setVisibility(event.target.value as WaveVisibility)}
        options={VISIBILITY_OPTIONS}
        hint="This actually controls who can open it — not just what's shown on screen."
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

      <div className="flex flex-col gap-1.5">
        <Input
          id={`${idPrefix}-collaborators`}
          label={TERMS.collaborators}
          placeholder="username"
          value={collaboratorInput}
          onChange={(event) => setCollaboratorInput(event.target.value)}
          onKeyDown={handleCollaboratorKeyDown}
          onBlur={addCollaborator}
          hint="Press Enter to add. They must accept before being credited."
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
                aria-label={`Remove @${username}`}
              >
                @{username}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-medium text-fg">Category</span>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
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

      <Button type="submit" size="lg" loading={submitting} fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}
