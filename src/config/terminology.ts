/**
 * Single source of truth for brand and product terminology.
 *
 * The product spec (§4) requires all user-facing language to be centralised so
 * the brand can be renamed without restructuring the application. Never hardcode
 * a product term in a component — import it from here.
 *
 * Product rule (§3.4): there are no Likes anywhere in this product. Do not add a
 * "like" term, icon, count, or placeholder to this file or anywhere else.
 */

export const BRAND = "AKINTI" as const;

export const BRAND_TAGLINE = "Where voices become connections." as const;

export const BRAND_DESCRIPTION =
  "An audio-first social network. Share your voice, discover creators, and turn listening into collaboration." as const;

export const TERMS = {
  /* Brand */
  brand: BRAND,
  tagline: BRAND_TAGLINE,

  /* Social object */
  wave: "Wave",
  waves: "Waves",
  aWave: "a Wave",

  /* Signals — no Likes, ever */
  play: "Play",
  plays: "Plays",
  replay: "Replay",
  replays: "Replays",
  comment: "Comment",
  comments: "Comments",
  save: "Save",
  saves: "Saves",
  saved: "Saved",
  unsave: "Unsave",
  share: "Share",
  shares: "Shares",

  /* Collaboration */
  duet: "Duet",
  duets: "Duets",
  duetRequest: "Duet Request",
  duetRequests: "Duet Requests",
  requestDuet: "Request a Duet",
  openForDuet: "Open for Duet",

  /* People */
  creator: "Creator",
  creators: "Creators",
  collaborator: "Collaborator",
  collaborators: "Collaborators",
  follow: "Follow",
  unfollow: "Unfollow",
  followers: "Followers",
  following: "Following",

  /* Creation types */
  recorded: "Recorded",
  uploaded: "Uploaded",
  record: "Record",
  upload: "Upload",

  /* Navigation */
  home: "Home",
  explore: "Explore",
  create: "Create",
  notifications: "Notifications",
  messages: "Messages",
  profile: "Profile",
  settings: "Settings",
  search: "Search",

  /* Auth */
  logIn: "Log in",
  signUp: "Sign up",
  logOut: "Log out",
  onboarding: "Get started",

  /* Playback */
  playAction: "Play",
  pauseAction: "Pause",
  seek: "Seek",
  waveform: "Waveform",
  duration: "Duration",
} as const;

export type TermKey = keyof typeof TERMS;

/** Look up a product term. Prefer `TERMS.x` where the key is statically known. */
export function t(key: TermKey): string {
  return TERMS[key];
}

/* ------------------------------------------------------------------ */
/* Creation types (§11)                                                */
/* ------------------------------------------------------------------ */

export type CreationType = "recorded" | "uploaded" | "duet";

export interface CreationTypeMeta {
  readonly id: CreationType;
  readonly label: string;
  readonly glyph: string;
  readonly description: string;
}

export const CREATION_TYPES: Readonly<Record<CreationType, CreationTypeMeta>> = {
  recorded: {
    id: "recorded",
    label: TERMS.recorded,
    glyph: "\u{1F399}",
    description: `Recorded inside ${BRAND}`,
  },
  uploaded: {
    id: "uploaded",
    label: TERMS.uploaded,
    glyph: "\u2191",
    description: "Uploaded audio file",
  },
  duet: {
    id: "duet",
    label: TERMS.duet,
    glyph: "\u{1F91D}",
    description: `A collaborative ${TERMS.wave}`,
  },
};

/* ------------------------------------------------------------------ */
/* Metrics (§11 card order)                                            */
/* ------------------------------------------------------------------ */

export type MetricKey = "plays" | "replays" | "comments" | "saves" | "shares" | "duets";

export interface MetricMeta {
  readonly key: MetricKey;
  readonly label: string;
  readonly singular: string;
}

/** Display order for the metrics row on a Wave card. */
export const METRICS: readonly MetricMeta[] = [
  { key: "plays", label: TERMS.plays, singular: TERMS.play },
  { key: "replays", label: TERMS.replays, singular: TERMS.replay },
  { key: "comments", label: TERMS.comments, singular: TERMS.comment },
  { key: "saves", label: TERMS.saves, singular: TERMS.save },
  { key: "shares", label: TERMS.shares, singular: TERMS.share },
  { key: "duets", label: TERMS.duets, singular: TERMS.duet },
];

/* ------------------------------------------------------------------ */
/* Site metadata                                                       */
/* ------------------------------------------------------------------ */

export const SITE = {
  name: BRAND,
  title: `${BRAND} — ${BRAND_TAGLINE}`,
  titleTemplate: `%s · ${BRAND}`,
  description: BRAND_DESCRIPTION,
  locale: "en",
} as const;
