"use client";

import { useMemo, useState, useTransition } from "react";
import { Mic, UserPlus } from "@/components/ui/icons";

import { completeOnboarding, followSuggestedCreator } from "./actions";
import { routes } from "@/config/routes";
import {
  MAX_ONBOARDING_INTERESTS,
  MIN_ONBOARDING_INTERESTS,
  SUGGESTED_INTERESTS,
  TERMS,
} from "@/config/terminology";
import { useCurrentUser } from "@/lib/auth";
import type { Profile } from "@/types/domain";
import { Avatar, Button, Chip, EmptyState, Input } from "@/components/ui";

export interface OnboardingFlowProps {
  initialUsername: string;
  initialDisplayName: string | null;
  suggestedCreators: Profile[];
  /** Where to land once onboarding finishes — usually the route that redirected here. */
  next?: string;
}

const STEP_LABELS = ["You", "Interests", "Creators", "First Wave"] as const;

export function OnboardingFlow({
  initialUsername,
  initialDisplayName,
  suggestedCreators,
  next,
}: OnboardingFlowProps) {
  const { refreshProfile } = useCurrentUser();

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [interests, setInterests] = useState<string[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const destination = useMemo(() => next ?? routes.home(), [next]);

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest],
    );
  }

  function toggleFollow(profileId: string) {
    setFollowedIds((current) => {
      const updated = new Set(current);
      updated.add(profileId);
      return updated;
    });
    startTransition(async () => {
      await followSuggestedCreator(profileId);
    });
  }

  function finish() {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await completeOnboarding({
        username,
        displayName: displayName.trim().length > 0 ? displayName.trim() : null,
        interests,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        return;
      }
      await refreshProfile();
      // A client-side `router.push` (even followed by `router.refresh()`)
      // can land on `destination` still rendered signed-out: the RSC fetch
      // Next's router issues for that navigation does not reliably carry
      // the just-set auth cookie (reproduced directly — the outgoing
      // request has no `Cookie` header at all even though the browser's
      // cookie jar has it, `path=/`, `SameSite=Lax`), so `AuthProvider`'s
      // server-rendered `initialUser` comes back `null` and the header
      // shows "Log in / Sign up" instead of the account menu, despite a
      // perfectly valid session. A full navigation does not have this
      // problem (verified: identical account, hard nav renders signed in
      // immediately) and this is a one-time, end-of-flow transition where
      // an SPA-smooth transition isn't worth the risk of landing a
      // brand-new user on an apparently-logged-out Home page.
      window.location.assign(destination);
    });
  }

  function finishAndCreate() {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await completeOnboarding({
        username,
        displayName: displayName.trim().length > 0 ? displayName.trim() : null,
        interests,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        return;
      }
      await refreshProfile();
      // Same reasoning as `finish()` above — a hard navigation guarantees
      // `/create` renders signed in.
      window.location.assign(routes.create());
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
          Step {step + 1} of {STEP_LABELS.length} · {STEP_LABELS[step]}
        </p>
        <button
          type="button"
          onClick={finish}
          disabled={isPending}
          className="text-xs font-medium text-fg-muted underline underline-offset-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-55"
        >
          Skip for now
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        {step === 0 ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div>
              <h2 className="text-base font-semibold text-fg">Claim your handle</h2>
              <p className="mt-1 text-sm text-fg-muted">You can always change this later in Settings.</p>
            </div>
            <Input
              id="onboarding-username"
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              hint="Lowercase letters, numbers and underscores. 3–30 characters."
              error={fieldErrors.username}
              required
            />
            <Input
              id="onboarding-display-name"
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              hint="Optional — shown instead of your username."
            />
            {formError ? (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            ) : null}
            <Button onClick={() => setStep(1)} disabled={username.trim().length < 3} fullWidth>
              Continue
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div>
              <h2 className="text-base font-semibold text-fg">What are you into?</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Pick {MIN_ONBOARDING_INTERESTS}–{MAX_ONBOARDING_INTERESTS} to help tailor {TERMS.explore}. Optional.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_INTERESTS.map((interest) => (
                <Chip
                  key={interest}
                  selected={interests.includes(interest)}
                  onClick={() => toggleInterest(interest)}
                  disabled={
                    !interests.includes(interest) && interests.length >= MAX_ONBOARDING_INTERESTS
                  }
                >
                  {interest}
                </Chip>
              ))}
            </div>
            <Button onClick={() => setStep(2)} fullWidth>
              Continue
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div>
              <h2 className="text-base font-semibold text-fg">Creators worth a follow</h2>
              <p className="mt-1 text-sm text-fg-muted">Optional — you can follow more from {TERMS.explore} any time.</p>
            </div>
            {suggestedCreators.length === 0 ? (
              <EmptyState
                size="sm"
                title="No suggestions yet"
                description={`Nobody has joined ${TERMS.brand} yet. Check back once creators start publishing.`}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {suggestedCreators.map((creator) => {
                  const followed = followedIds.has(creator.id);
                  return (
                    <li key={creator.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <Avatar name={creator.displayName ?? creator.username} src={creator.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">
                          {creator.displayName ?? creator.username}
                        </p>
                        <p className="truncate text-xs text-fg-subtle">@{creator.username}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={followed ? "secondary" : "primary"}
                        leadingIcon={followed ? undefined : <UserPlus className="size-3.5" />}
                        disabled={followed}
                        onClick={() => toggleFollow(creator.id)}
                      >
                        {followed ? TERMS.following : TERMS.follow}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button onClick={() => setStep(3)} fullWidth>
              Continue
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
                <Mic className="size-6" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-fg">Ready to share your voice?</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Record or upload your first {TERMS.wave} — it only takes a moment.
                </p>
              </div>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            ) : null}
            <Button onClick={finishAndCreate} loading={isPending} fullWidth>
              {TERMS.record} {TERMS.aWave}
            </Button>
            <Button onClick={finish} loading={isPending} variant="secondary" fullWidth>
              Skip, take me to {TERMS.home}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
