"use client";

/**
 * What a Wave's own creator can do with it (SCREENS.md §5): edit its details,
 * open it for anyone to Duet, or delete it. Real loading and error states
 * throughout, and the delete confirmation spells out what is lost rather than
 * asking "are you sure" (§4.4).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { closeOpenCall, setOpenCall } from "@/app/(app)/w/[id]/duet/actions";
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
import { Handshake, MoreVertical, Pencil, Trash2 } from "@/components/ui/icons";
import { TERMS } from "@/config/terminology";
import { PERMISSION_AUDIENCES, WAVE_VISIBILITIES } from "@/types/domain";
import type { PermissionAudience, Wave, WaveVisibility } from "@/types/domain";

import { deleteWaveDetails, updateWaveDetails } from "./actions";

export interface WaveOwnerMenuProps {
  wave: Wave;
  /** Where to send the creator once the Wave is deleted. */
  redirectAfterDeleteHref: string;
  /** Whether this Wave already carries an open call. */
  openCallIsOpen?: boolean;
  /** The prompt on the existing open call, if there is one. */
  openCallPrompt?: string | null;
}

const VISIBILITY_OPTIONS: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
  value,
  label: value === "everyone" ? "Everyone" : value === "followers" ? "Followers" : "Only me",
}));

const COMMENT_PERMISSION_OPTIONS: SelectOption[] = [
  { value: "", label: "Use my profile setting" },
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "Followers" },
  { value: "nobody", label: "Nobody" },
];

const DUET_PERMISSION_OPTIONS: SelectOption[] = [
  { value: "", label: "Use my profile setting" },
  ...PERMISSION_AUDIENCES.map((value) => ({
    value,
    label:
      value === "everyone"
        ? "Everyone"
        : value === "followers"
          ? "Followers"
          : value === "following"
            ? "People I follow"
            : "Nobody",
  })),
];

export function WaveOwnerMenu({
  wave,
  redirectAfterDeleteHref,
  openCallIsOpen = false,
  openCallPrompt = null,
}: WaveOwnerMenuProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
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

  const [prompt, setPrompt] = useState(openCallPrompt ?? "");
  const [callSaving, setCallSaving] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

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

  const handleOpenCall = async (): Promise<void> => {
    setCallSaving(true);
    setCallError(null);
    const result = await setOpenCall(wave.id, prompt.trim() || null, null);
    setCallSaving(false);
    if (!result.ok) {
      setCallError(result.error);
      return;
    }
    setCallOpen(false);
    router.refresh();
  };

  const handleCloseCall = async (): Promise<void> => {
    setCallSaving(true);
    setCallError(null);
    const result = await closeOpenCall(wave.id);
    setCallSaving(false);
    if (!result.ok) {
      setCallError(result.error);
      return;
    }
    setCallOpen(false);
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
        label={`Options for ${wave.title}`}
        trigger={(triggerProps) => (
          <IconButton
            {...triggerProps}
            label={`${TERMS.wave} options`}
            icon={<MoreVertical className="size-6" />}
            variant="ghost"
          />
        )}
        items={[
          {
            id: "edit",
            label: "Edit details",
            icon: <Pencil className="size-4" />,
            onSelect: () => setEditOpen(true),
          },
          {
            id: "open-call",
            label: openCallIsOpen ? "Close the open call" : "Open for anyone to Duet",
            icon: <Handshake className="size-4" />,
            onSelect: () => setCallOpen(true),
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
        title="Edit details"
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
          <Input
            id="edit-wave-title"
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <Textarea
            id="edit-wave-description"
            label="What is this?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Select
            id="edit-wave-visibility"
            label="Who can hear it"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as WaveVisibility)}
            options={VISIBILITY_OPTIONS}
          />
          <Select
            id="edit-wave-comment-permission"
            label="Who can comment"
            value={commentPermission}
            onChange={(event) => setCommentPermission(event.target.value)}
            options={COMMENT_PERMISSION_OPTIONS}
          />
          <Select
            id="edit-wave-duet-permission"
            label={`Who can ask for a ${TERMS.duet}`}
            value={duetPermission}
            onChange={(event) => setDuetPermission(event.target.value as PermissionAudience | "")}
            options={DUET_PERMISSION_OPTIONS}
          />
          {saveError ? (
            <p role="alert" className="type-body-sm text-signal-deep">
              {saveError}
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={callOpen}
        onClose={() => setCallOpen(false)}
        title={openCallIsOpen ? "Close the open call" : "Open for anyone to Duet"}
        description={
          openCallIsOpen
            ? "Nobody new will be able to record against this Wave. Duets already recorded stay where they are."
            : "Anyone who can hear this Wave can record with it straight away, without asking first."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCallOpen(false)} disabled={callSaving}>
              Cancel
            </Button>
            {openCallIsOpen ? (
              <Button variant="danger" onClick={() => void handleCloseCall()} loading={callSaving}>
                Close the call
              </Button>
            ) : (
              <Button onClick={() => void handleOpenCall()} loading={callSaving}>
                Open the call
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {openCallIsOpen ? null : (
            <Textarea
              id="open-call-prompt"
              label="What do you want back? (optional)"
              placeholder="A bass line under the second verse."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          )}
          {callError ? (
            <p role="alert" className="type-body-sm text-signal-deep">
              {callError}
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={`Delete ${wave.title}?`}
        description="This removes the recording, its comments and every Duet request against it. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
              Delete it
            </Button>
          </div>
        }
      >
        {deleteError ? (
          <p role="alert" className="type-body-sm text-signal-deep">
            {deleteError}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
