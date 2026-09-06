"use client";

/**
 * What a Wave's own creator can do with it (SCREENS.md §5): edit its details,
 * open it for anyone to Duet, or delete it. Real loading and error states
 * throughout, and the delete confirmation spells out what is lost rather than
 * asking "are you sure" (§4.4).
 */

import { useTranslations } from "next-intl";
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

export function WaveOwnerMenu({
  wave,
  redirectAfterDeleteHref,
  openCallIsOpen = false,
  openCallPrompt = null,
}: WaveOwnerMenuProps) {
  const t = useTranslations("WaveOwnerMenu");
  const tTerms = useTranslations("Terms");
  const router = useRouter();

  const visibilityOptions: SelectOption[] = WAVE_VISIBILITIES.map((value) => ({
    value,
    label: value === "everyone" ? t("everyone") : value === "followers" ? t("followers") : t("onlyMe"),
  }));

  const commentPermissionOptions: SelectOption[] = [
    { value: "", label: t("useMyProfileSetting") },
    { value: "everyone", label: t("everyone") },
    { value: "followers", label: t("followers") },
    { value: "nobody", label: t("nobody") },
  ];

  const duetPermissionOptions: SelectOption[] = [
    { value: "", label: t("useMyProfileSetting") },
    ...PERMISSION_AUDIENCES.map((value) => ({
      value,
      label:
        value === "everyone"
          ? t("everyone")
          : value === "followers"
            ? t("followers")
            : value === "following"
              ? t("peopleIFollow")
              : t("nobody"),
    })),
  ];

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
        label={t("optionsForWave", { title: wave.title })}
        trigger={(triggerProps) => (
          <IconButton
            {...triggerProps}
            label={t("waveOptions", { wave: tTerms("wave") })}
            icon={<MoreVertical className="size-6" />}
            variant="ghost"
          />
        )}
        items={[
          {
            id: "edit",
            label: t("editDetails"),
            icon: <Pencil className="size-4" />,
            onSelect: () => setEditOpen(true),
          },
          {
            id: "open-call",
            label: openCallIsOpen ? t("closeTheOpenCall") : t("openForAnyoneToDuet"),
            icon: <Handshake className="size-4" />,
            onSelect: () => setCallOpen(true),
          },
          {
            id: "delete",
            label: t("delete"),
            icon: <Trash2 className="size-4" />,
            destructive: true,
            onSelect: () => setConfirmingDelete(true),
          },
        ]}
      />

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t("editDetails")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {tTerms("save")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            id="edit-wave-title"
            label={t("titleLabel")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <Textarea
            id="edit-wave-description"
            label={t("whatIsThis")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Select
            id="edit-wave-visibility"
            label={t("whoCanHearIt")}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as WaveVisibility)}
            options={visibilityOptions}
          />
          <Select
            id="edit-wave-comment-permission"
            label={t("whoCanComment")}
            value={commentPermission}
            onChange={(event) => setCommentPermission(event.target.value)}
            options={commentPermissionOptions}
          />
          <Select
            id="edit-wave-duet-permission"
            label={t("whoCanAskForADuet", { duet: tTerms("duet") })}
            value={duetPermission}
            onChange={(event) => setDuetPermission(event.target.value as PermissionAudience | "")}
            options={duetPermissionOptions}
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
        title={openCallIsOpen ? t("closeTheOpenCall") : t("openForAnyoneToDuet")}
        description={openCallIsOpen ? t("closeCallDescription") : t("openCallDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCallOpen(false)} disabled={callSaving}>
              {t("cancel")}
            </Button>
            {openCallIsOpen ? (
              <Button variant="danger" onClick={() => void handleCloseCall()} loading={callSaving}>
                {t("closeTheCall")}
              </Button>
            ) : (
              <Button onClick={() => void handleOpenCall()} loading={callSaving}>
                {t("openTheCall")}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {openCallIsOpen ? null : (
            <Textarea
              id="open-call-prompt"
              label={t("openCallPromptLabel")}
              placeholder={t("openCallPromptPlaceholder")}
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
        title={t("deleteWaveTitle", { title: wave.title })}
        description={t("deleteWaveDescription")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              {t("keepIt")}
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
              {t("deleteIt")}
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
