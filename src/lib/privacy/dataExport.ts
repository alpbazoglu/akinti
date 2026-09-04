/**
 * "Download my data" (spec §25/§26 "Safety ... security"). A real export, not
 * a placeholder button (spec §44 rule 9 — no fake functionality): the user's
 * own profile, their Waves' metadata, and their comments, as one JSON
 * document a browser can save directly.
 *
 * Deliberately narrow scope for v1 — no messages, no play/listen history, no
 * other accounts' data referencing this one (followers, a Duet partner's
 * Wave). Exactly what spec §25 groups under this account's own settings
 * surfaces (Account, Content) is what this exports.
 */

import type { Comment, Profile, Wave } from "@/types/domain";

export interface AccountDataExportProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  privacy: Profile["privacy"];
  interests: string[];
  createdAt: string;
}

export interface AccountDataExportWave {
  id: string;
  title: string;
  description: string | null;
  creationType: Wave["creationType"];
  visibility: Wave["visibility"];
  tags: string[];
  counts: Wave["counts"];
  publishedAt: string;
}

export interface AccountDataExportComment {
  id: string;
  waveId: string;
  parentCommentId: string | null;
  body: string;
  createdAt: string;
}

export interface AccountDataExport {
  exportedAt: string;
  profile: AccountDataExportProfile;
  waves: AccountDataExportWave[];
  comments: AccountDataExportComment[];
}

export interface SerializeAccountDataExportInput {
  profile: Profile;
  /** The account's own Waves (any visibility) — deleted/hidden ones are the caller's job to exclude before calling this. */
  waves: Wave[];
  /** The account's own comments. */
  comments: Comment[];
  /** Overridable for deterministic tests; defaults to the current time. */
  now?: () => Date;
}

/**
 * Pure — no I/O. `src/app/(app)/settings/actions.ts#exportAccountData` is the
 * only caller: it gathers the three inputs via the authenticated Supabase
 * client (so RLS/`can_view_wave` already scope what "the account's own
 * Waves/comments" even means) and hands them here to shape into the final
 * document, kept separate so the shaping logic is unit-testable without a
 * database.
 */
export function serializeAccountDataExport(input: SerializeAccountDataExportInput): AccountDataExport {
  const now = input.now ?? (() => new Date());
  return {
    exportedAt: now().toISOString(),
    profile: {
      id: input.profile.id,
      username: input.profile.username,
      displayName: input.profile.displayName,
      bio: input.profile.bio,
      privacy: input.profile.privacy,
      interests: input.profile.interests,
      createdAt: input.profile.createdAt,
    },
    waves: input.waves.map((wave) => ({
      id: wave.id,
      title: wave.title,
      description: wave.description,
      creationType: wave.creationType,
      visibility: wave.visibility,
      tags: wave.tags,
      counts: wave.counts,
      publishedAt: wave.publishedAt,
    })),
    comments: input.comments.map((comment) => ({
      id: comment.id,
      waveId: comment.waveId,
      parentCommentId: comment.parentCommentId,
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  };
}

/** The filename the client should save the export under. */
export function accountDataExportFilename(username: string, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `akinti-${username}-${date}.json`;
}
