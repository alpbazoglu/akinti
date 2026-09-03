import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// FollowButton/ProfileOverflowMenu/ReportSheet import Server Actions from a
// "use server" file that itself imports `next/headers` — real only inside a
// Next.js request. Mocking the actions module keeps this a pure component
// test of `ProfileHeader`'s rendered states, never actually invoking them.
vi.mock("@/app/(app)/u/[username]/actions", () => ({
  follow: vi.fn(async () => ({ ok: true, status: "accepted" })),
  unfollow: vi.fn(async () => ({ ok: true, status: null })),
  cancelFollowRequest: vi.fn(async () => ({ ok: true, status: null })),
  acceptFollowRequest: vi.fn(async () => ({ ok: true })),
  declineFollowRequest: vi.fn(async () => ({ ok: true })),
  block: vi.fn(async () => ({ ok: true, message: "Account blocked." })),
  unblock: vi.fn(async () => ({ ok: true, message: "Account unblocked." })),
  submitProfileReport: vi.fn(async () => ({ ok: true, message: "Report submitted." })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ProfileHeader, type ProfileHeaderProps, type ProfileHeaderViewerState } from "./ProfileHeader";
import type { Profile } from "@/types/domain";
import { ToastProvider } from "@/components/ui";

/** `ShareProfileButton` calls `useToast()`, so every render needs a provider. */
function renderHeader(props: ProfileHeaderProps) {
  return render(
    <ToastProvider>
      <ProfileHeader {...props} />
    </ToastProvider>,
  );
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    username: "maria",
    displayName: "Maria Lopez",
    bio: "Singer, songwriter.",
    avatarUrl: null,
    privacy: "public",
    theme: {
      backgroundColor: "ink",
      backgroundGradient: "none",
      backgroundPattern: "none",
      accent: "aqua",
    },
    permissions: {
      duet: "everyone",
      message: "everyone",
      comment: "everyone",
      defaultWaveVisibility: "everyone",
    },
    interests: [],
    onboardedAt: "2026-01-01T00:00:00.000Z",
    counts: { followers: 10, following: 5, waves: 3 },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function viewer(overrides: Partial<ProfileHeaderViewerState> = {}): ProfileHeaderViewerState {
  return {
    isSelf: false,
    isSignedIn: true,
    followStatus: null,
    followsViewer: false,
    isBlockedByViewer: false,
    ...overrides,
  };
}

describe("ProfileHeader", () => {
  it("own profile: shows Edit profile, no Follow/Message/overflow actions", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer({ isSelf: true }) });

    expect(screen.getByRole("link", { name: /edit profile/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^follow$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^message$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /more actions/i })).toBeNull();
  });

  it("anonymous visitor: shows a Follow action and no overflow menu (sign-in required to block/report)", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer({ isSignedIn: false, followStatus: null }) });

    expect(screen.getByRole("button", { name: /^follow$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more actions/i })).toBeNull();
  });

  it("following: shows Following (muted) instead of Follow", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer({ followStatus: "accepted" }) });

    expect(screen.getByRole("button", { name: /following/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^follow$/i })).toBeNull();
  });

  it("requested: shows Requested for a pending follow request", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer({ followStatus: "pending" }) });

    expect(screen.getByRole("button", { name: /requested/i })).toBeInTheDocument();
  });

  it("blocked: the overflow menu offers Unblock instead of Block", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer({ isBlockedByViewer: true }) });

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

    expect(screen.getByRole("menuitem", { name: /unblock/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /^block$/i })).toBeNull();
  });

  it("renders a plain Message link pointed at /messages/new, not an interactive compose flow", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer() });

    const link = screen.getByRole("link", { name: /^message$/i });
    expect(link).toHaveAttribute("href", "/messages/new?to=maria");
  });

  it("renders identity and counts", () => {
    renderHeader({ profile: makeProfile(), viewer: viewer() });

    expect(screen.getByRole("heading", { name: "Maria Lopez" })).toBeInTheDocument();
    expect(screen.getByText("@maria")).toBeInTheDocument();
    expect(screen.getByText("Singer, songwriter.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /10 Followers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /5 Following/i })).toBeInTheDocument();
  });
});
