/**
 * Application-level domain types for AKINTI.
 *
 * `database.ts` describes the wire format Postgres speaks. This file describes
 * the objects the rest of the app thinks in. UI and feature code should import
 * from here; only `src/lib/db/**` should need `database.ts` directly.
 *
 * Product vocabulary is fixed (spec s4): Wave, Play, Replay, Comment, Save,
 * Share, Duet, Duet Request, Creator, Collaborators, Recorded, Uploaded.
 * There is no Like anywhere in this file, and there must never be.
 */

import type {
  AudioEnhancementPreset,
  AudioJobStatus,
  AudioJobType,
  AudioProcessingStatus,
  CollaboratorStatus,
  ContentOrigin,
  ConversationKind,
  DuetRequestStatus,
  FollowStatus,
  Json,
  MessageKind,
  NotificationType,
  PermissionAudience,
  ProfilePrivacy,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  ShareChannel,
  ThemeAccent,
  ThemeBackgroundColor,
  ThemeBackgroundGradient,
  ThemeBackgroundPattern,
  WaveCreationType,
  WaveVisibility,
} from "./database";

export type {
  AudioEnhancementPreset,
  AudioJobStatus,
  AudioJobType,
  AudioProcessingStatus,
  CollaboratorStatus,
  ContentOrigin,
  ConversationKind,
  DuetRequestStatus,
  FollowStatus,
  Json,
  MessageKind,
  NotificationType,
  PermissionAudience,
  ProfilePrivacy,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  ShareChannel,
  ThemeAccent,
  ThemeBackgroundColor,
  ThemeBackgroundGradient,
  ThemeBackgroundPattern,
  WaveCreationType,
  WaveVisibility,
};

/** Runtime lists — useful for `<select>` options and for Zod enums. */
export const PROFILE_PRIVACIES = ["public", "private"] as const;
export const PERMISSION_AUDIENCES = ["everyone", "followers", "following", "nobody"] as const;
export const COMMENT_AUDIENCES = ["everyone", "followers", "nobody"] as const;
export const WAVE_VISIBILITIES = ["everyone", "followers", "only_me"] as const;
export const WAVE_CREATION_TYPES = ["recorded", "uploaded", "duet"] as const;
export const CONTENT_ORIGINS = ["original", "cover", "licensed", "unknown"] as const;
export const THEME_BACKGROUND_COLORS = ["ink", "slate", "sand", "mist", "plum", "forest"] as const;
export const THEME_BACKGROUND_GRADIENTS = [
  "none",
  "dawn",
  "dusk",
  "tide",
  "ember",
  "aurora",
] as const;
export const THEME_BACKGROUND_PATTERNS = [
  "none",
  "waves",
  "dots",
  "grid",
  "noise",
  "rings",
] as const;
export const THEME_ACCENTS = ["aqua", "violet", "amber", "rose", "emerald", "slate"] as const;
export const AUDIO_ENHANCEMENT_PRESETS = [
  "natural",
  "studio",
  "clear_voice",
  "warm",
  "deep",
  "atmospheric",
] as const;
export const SHARE_CHANNELS = ["link", "message", "native"] as const;
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "impersonation",
  "copyright",
  "inappropriate",
  "abusive",
  "other",
] as const;
export const REPORT_TARGET_TYPES = ["wave", "comment", "profile", "message"] as const;

/* ------------------------------------------------------------------------ */
/* Profile                                                                   */
/* ------------------------------------------------------------------------ */

export interface ProfileTheme {
  backgroundColor: ThemeBackgroundColor;
  backgroundGradient: ThemeBackgroundGradient;
  backgroundPattern: ThemeBackgroundPattern;
  accent: ThemeAccent;
}

export interface ProfilePermissions {
  duet: PermissionAudience;
  message: PermissionAudience;
  comment: PermissionAudience;
  defaultWaveVisibility: WaveVisibility;
}

export interface ProfileCounts {
  followers: number;
  following: number;
  waves: number;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  privacy: ProfilePrivacy;
  theme: ProfileTheme;
  permissions: ProfilePermissions;
  interests: string[];
  onboardedAt: string | null;
  counts: ProfileCounts;
  createdAt: string;
}

/** What the viewer may do with a profile, resolved server-side. */
export interface ProfileViewerState {
  isSelf: boolean;
  followStatus: FollowStatus | null;
  followsViewer: boolean;
  isBlockedByViewer: boolean;
  canViewContent: boolean;
  canMessage: boolean;
}

/* ------------------------------------------------------------------------ */
/* Audio                                                                     */
/* ------------------------------------------------------------------------ */

/** Compact waveform peaks produced once by the worker and cached forever. */
export interface WaveformPeaks {
  version: number;
  bits: number;
  samplesPerPixel: number;
  /** Normalised 0..(2^bits - 1) amplitude buckets. */
  data: number[];
}

export interface AudioAsset {
  id: string;
  ownerId: string;
  /**
   * Storage key inside the PRIVATE `audio` bucket. Never render this.
   *
   * Column-level SELECT on this (and `processedPath`) is revoked from
   * anon/authenticated (migration 15, spec §33) — `getAudioAssetById` and
   * every other non-privileged read in `src/lib/db/audioAssets.ts` always
   * returns `""` here. A real value only ever comes from
   * `mintSignedAudioUrl`/`mintPlaybackUrl`, which resolve it server-side with
   * the service-role client after `can_view_audio_asset()` has authorised
   * the caller — see "Storage security" in docs/AUDIO_ARCHITECTURE.md.
   */
  originalPath: string;
  /** Same redaction as `originalPath` above; `null` here never means "no processed file yet" outside a privileged read. */
  processedPath: string | null;
  durationMs: number | null;
  mimeType: string;
  byteSize: number;
  sampleRate: number | null;
  channels: number | null;
  peaks: WaveformPeaks | null;
  processingStatus: AudioProcessingStatus;
  processingError: string | null;
  enhancementPreset: AudioEnhancementPreset;
  createdAt: string;
  processedAt: string | null;
}

/** An asset plus the short-lived signed URL a browser may actually fetch. */
export interface PlayableAudio extends AudioAsset {
  signedUrl: string;
  signedUrlExpiresAt: string;
}

export interface AudioProcessingJob {
  id: number;
  audioAssetId: string;
  jobType: AudioJobType;
  status: AudioJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  payload: Json;
  result: Json | null;
  runAfter: string;
  createdAt: string;
  finishedAt: string | null;
}

/* ------------------------------------------------------------------------ */
/* Wave                                                                      */
/* ------------------------------------------------------------------------ */

export interface WaveCounts {
  plays: number;
  replays: number;
  comments: number;
  saves: number;
  shares: number;
  duets: number;
}

export interface WaveDuetLineage {
  /** Root of the Duet chain; null on an original Wave. */
  originalWaveId: string | null;
  /** Immediate parent; null on an original Wave. */
  parentWaveId: string | null;
  duetRequestId: string | null;
  depth: number;
}

export interface Wave {
  id: string;
  creatorId: string;
  audioAssetId: string;
  title: string;
  description: string | null;
  creationType: WaveCreationType;
  visibility: WaveVisibility;
  /** `null` means "inherit the creator's profile setting". */
  commentPermission: PermissionAudience | null;
  duetPermission: PermissionAudience | null;
  duet: WaveDuetLineage;
  contentOrigin: ContentOrigin;
  tags: string[];
  counts: WaveCounts;
  publishedAt: string;
  updatedAt: string;
}

export interface Collaborator {
  id: string;
  waveId: string;
  profileId: string;
  invitedBy: string | null;
  status: CollaboratorStatus;
  role: string | null;
  createdAt: string;
  respondedAt: string | null;
}

/** A Wave hydrated for rendering: creator, audio and viewer-specific state. */
export interface WaveWithContext {
  wave: Wave;
  creator: Profile;
  audio: AudioAsset;
  collaborators: Collaborator[];
  viewer: {
    isCreator: boolean;
    hasSaved: boolean;
    canComment: boolean;
    canRequestDuet: boolean;
  };
}

/* ------------------------------------------------------------------------ */
/* Comments                                                                  */
/* ------------------------------------------------------------------------ */

export interface Comment {
  id: string;
  waveId: string;
  authorId: string;
  parentCommentId: string | null;
  body: string;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentWithAuthor extends Comment {
  author: Profile;
}

export interface Share {
  id: string;
  waveId: string;
  sharerId: string;
  channel: ShareChannel;
  conversationId: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------------ */
/* Playback metrics                                                          */
/* ------------------------------------------------------------------------ */

/** What the client reports. The server decides what it means. */
export interface PlaybackReport {
  waveId: string;
  sessionId: string;
  listenedMs: number;
  durationMs?: number;
  completed?: boolean;
}

/** What the server decided. */
export interface PlaybackOutcome {
  ignored: boolean;
  countedPlay: boolean;
  countedReplay: boolean;
  thresholdMs?: number;
}

export interface WaveListen {
  waveId: string;
  listenerKey: string;
  listenerId: string | null;
  playCounted: boolean;
  replayCounted: boolean;
  listenCount: number;
  completedCount: number;
  totalListenedMs: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

/* ------------------------------------------------------------------------ */
/* Duets                                                                     */
/* ------------------------------------------------------------------------ */

export interface DuetRequest {
  id: string;
  waveId: string;
  requesterId: string;
  recipientId: string;
  message: string | null;
  status: DuetRequestStatus;
  expiresAt: string;
  resultingWaveId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

/** One node of the Duet tree (spec s15). */
export interface DuetTreeNode {
  wave: Wave;
  creator: Profile;
  children: DuetTreeNode[];
}

/* ------------------------------------------------------------------------ */
/* Messaging                                                                 */
/* ------------------------------------------------------------------------ */

export interface Conversation {
  id: string;
  kind: ConversationKind;
  createdBy: string | null;
  title: string | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface ConversationMember {
  conversationId: string;
  profileId: string;
  joinedAt: string;
  lastReadAt: string | null;
  muted: boolean;
}

export interface ConversationSummary {
  conversation: Conversation;
  members: Profile[];
  lastMessage: Message | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string | null;
  audioAssetId: string | null;
  sharedWaveId: string | null;
  duetRequestId: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------------ */
/* Notifications / moderation                                                */
/* ------------------------------------------------------------------------ */

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  actorId: string | null;
  waveId: string | null;
  commentId: string | null;
  duetRequestId: string | null;
  conversationId: string | null;
  messageId: string | null;
  /** Collapse key, e.g. `save:<waveId>`. */
  groupKey: string;
  /** Number of grouped events, >= 1. "Maria and 2 others saved your Wave". */
  count: number;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationWithActor extends Notification {
  actor: Profile | null;
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetWaveId: string | null;
  targetCommentId: string | null;
  targetProfileId: string | null;
  targetMessageId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface Block {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

/* ------------------------------------------------------------------------ */
/* Pagination                                                                */
/* ------------------------------------------------------------------------ */

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when the list is exhausted. */
  nextCursor: string | null;
}

export interface CursorPageParams {
  limit?: number;
  cursor?: string | null;
}
