"use client";

/**
 * Owner-only Edit/Delete for the Wave detail page (spec §11, §21, §38).
 * Real loading/error states throughout — no optimistic "looks done" UI.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

import {
  Button,
  IconButton,
  Input,
  Menu,
  Select,
  Sheet,
  Textarea,
  type SelectOption,
} from "@/components/ui";
import { PERMISSION_AUDIENCES, WAVE_VISIBILITIES } from "@/types/domain";
import type { PermissionAudience, Wave, WaveVisibility } from "@/types/domain";

import { deleteWaveDetails, updateWaveDetails } from "./actions";

export interface WaveOwnerMenuProps {
  wave: Wave;
  /** Where to send the owner once the Wave is deleted. */
  redirectAfterDeleteHref: string;
}

const VISIBILITY_OPTIONS: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
  value,
  label: value === "everyone" ? "Everyone" : value === "followers" ? "Followers" : "Only me",
}));

const COMMENT_PERMISSION_OPTIONS: SelectOption[] = [
  { value: "", label: "Use my profile default" },
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "Followers" },
  { value: "nobody", label: "Nobody" },
];

const DUET_PERMISSION_OPTIONS: SelectOption[] = [
  { value: "", label: "Use my profile default" },
  ...PERMISSION_AUDIENCES.map((value) => ({
    value,
    label: value === "everyone" ? "Everyone" : value === "followers" ? "Followers" : value === "following" ? "Following" : "Nobody",
  })),
];

export function WaveOwnerMenu({ wave, redirectAfterDeleteHref }: WaveOwnerMenuProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [title, setTitle] = useState(wave.title);
  const [description, setDescription] = useState(wave.description ?? "");
  const [visibility, setVisibility] = useState<WaveVisibility>(wave.visibility);
  const [commentPermission, setCommentPermission] = useState<string>(wave.commentPermission ?? "");
  const [duetPermission, setDuetPermission] = useState<PermissionAudience | "">(
    wave.duetPermission ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    const result = await updateWaveDetails(wave.id, {
      title: title.trim(),
      description: description.trim() || null,
      visibility,
      comment_permission: (commentPermission || null) as "everyone" | "followers" | "nobody" | null,
      duet_permission: (duetPermission || null) as
        | "everyone"
        | "followers"
        | "following"
        | "nobody"
        | null,
    });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    setEditOpen(false);
    router.refresh();
  };

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteWaveDetails(wave.id);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    router.push(redirectAfterDeleteHref);
    router.refresh();
  };

  return (
    <>
      <Menu
        label="Wave options"
        trigger={(triggerProps) => (
          <IconButton
            {...triggerProps}
            label="Wave options"
            icon={<MoreVertical className="size-4" />}
            variant="ghost"
          />
        )}
        items={[
          {
            id: "edit",
            label: "Edit",
            icon: <Pencil className="size-4" />,
            onSelect: () => setEditOpen(true),
          },
          {
            id: "delete",
            label: "Delete",
            icon: <Trash2 className="size-4" />,
            destructive: true,
            onSelect: () => setConfirmingDelete(true),
          },
        ]}
      />

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Wave"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              Save
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input id="edit-wave-title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Textarea
            id="edit-wave-description"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Select
            id="edit-wave-visibility"
            label="Visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as WaveVisibility)}
            options={VISIBILITY_OPTIONS}
          />
          <Select
            id="edit-wave-comment-permission"
            label="Who can comment"
            value={commentPermission}
            onChange={(e) => setCommentPermission(e.target.value)}
            options={COMMENT_PERMISSION_OPTIONS}
          />
          <Select
            id="edit-wave-duet-permission"
            label="Who can request a Duet"
            value={duetPermission}
            onChange={(e) => setDuetPermission(e.target.value as PermissionAudience | "")}
            options={DUET_PERMISSION_OPTIONS}
          />
          {saveError ? (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this Wave?"
        description="This can't be undone. The Wave and its audio are removed everywhere."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
              Delete
            </Button>
          </div>
        }
      >
        {deleteError ? (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">This action is permanent.</p>
        )}
      </Sheet>
    </>
  );
}
