# AKINTI UX Audit — Findings & Verdict

Evidence: 58 screenshots (mobile 390×844, desktop 1280+), `_raw-log.txt` console/network capture, against `mobile-guidelines.md` §5+checklist and `2026-09-market-research.md` §2. Run was against a local `next dev` build (`localhost:3333`) — the black "N" badge fixed in the bottom-left corner of every screen is the Next.js dev indicator; confirm it is absent from production builds, it was not treated as a product bug below.

## (a) BROKEN

1. **Explore's six secondary tabs never load.** `04-mobile-explore-new.png` through `09-mobile-explore-open-for-duet.png` (and desktop `52-desktop-explore-open-for-duet.png`) show permanent skeleton placeholders — only "Trending" renders real content. This reproduced twice, ~20 minutes apart, across two separate test runs (the leftover `02-mobile-explore.png`, `03-mobile-explore-open-for-duet.png` duplicates), so it is a persistent bug, not a one-off race. **Severity: High** — for a cold-start user with an empty follow graph, Explore is the *only* discovery surface, and 6 of 7 tabs are dead.
2. **A "Rendering…" pill gets stuck on-screen and blocks controls.** Visible in `04–09-mobile-explore-*.png`, `22/23-mobile-wave-comment/save.png`, and `24-mobile-wave-share-sheet.png`, where it overlaps the bottom nav labels and literally covers the "Send in a message" share option. **Severity: High** — it's not just cosmetic, it sits on top of tappable text.
3. **Desktop sign-out does not redirect.** Log: `[desktop] Signed out, landed on http://localhost:3333/analytics`. Mobile signs out correctly to `/login?next=%2F`. **Severity: High** — a signed-out desktop user is left on what should be an authenticated data page; inconsistent with mobile and a likely route-guard gap.
4. **Hydration mismatch on the login page.** Console error on `01-mobile-login.png` load: SSR/client branch on `style={{caret-color:"transparent"}}` for the email/password inputs. **Severity: Medium** — React warns this "won't be patched up"; on real devices this can flash/re-render the very first screen a user sees.
5. **Notification-badge requests fail on nearly every navigation.** `_raw-log.txt` shows the same `HEAD .../notifications?...` call failing with `net::ERR_ABORTED` before almost every screenshot in the run (20+ occurrences). **Severity: Medium-High** — either the polling logic aborts its own request or the endpoint is broken; either way it's console noise on every route change and the unread badge cannot be trusted.
6. **Preset-picker interaction failure recorded by the test harness.** Log: `Preset picker interaction failed: locator.click: Timeout 30000ms exceeded ... getByRole('button', { name: /^studio$/i })` during the enhancement step (`16b/17-mobile-create-details*.png`). **Severity: Medium** — independent evidence the "Studio" preset control is not reliably clickable.
7. **Mic-denied state is a dead end.** `13-mobile-create-record-denied.png`: "Could not access the microphone. Please try again." with no link to browser permission settings and no fallback (e.g., switch to Upload). **Severity: Medium** — violates the guideline's error-copy rule (state the fix, not just what happened).

## (b) WEAK

**Internal copy leaking to users (the single worst "cheap" tell found):** Search page subhead reads *"Creators and Waves, matched deterministically (spec §24)."* (`11/53-*-search.png`); the wave-visibility field says *"Enforced server-side, not just hidden in the UI."* (`17-mobile-create-details.png`). Analytics tags every metric "Meaningful" or "Raw" with no explanation (`40/62-*-analytics.png`). This reads as an engineer's changelog, not product copy — the single fastest way to make a 2026 audio-social app feel like an internal tool rather than TikTok/Smule-class polish.

**Audio-specific gaps:** the waveform is a flat, near-invisible pale-gray line, not an amplitude waveform, on every wave/comment/save/profile screen (`18,19,21–25,56,57`) — for an "audio-first" app this is the single most under-designed element. No 3-second countdown before recording (`12-mobile-create-record-default.png` goes straight to `0:00` + mic button). No "best with headphones" prompt anywhere in the record flow, despite Duets being the core loop. "Retake" exists only as "Start over" at the enhance step, not immediately after a take.

**Mobile:** the stuck "Rendering…" pill (see Broken #2) sits directly over the bottom-tab labels, reducing an already-marginal tap target. Empty states are copy-excellent but visually identical (icon + h2 + 1–2 lines + link) on Home, Notifications, Messages, Duets, Safety, Follow-requests — six screens with the *exact same template*, which is efficient but also numbingly uniform (the guideline explicitly warns against reusing one template everywhere).

**Desktop:** every one of 13 desktop screens (`50–62`) confines content to a narrow left-anchored column and leaves ~40–50% of the viewport as flat, unused gray space on the right — not even a centered layout, just a truncated one. No responsive use of the extra width for a secondary column, larger player, or side rail. This is worse than the "centered narrow column" pattern the guidelines warn about.

**Inconsistency between screens:** the Explore "Rising creators" card shows the identical single seed account across all seven tabs; the share sheet (`24-mobile-wave-share-sheet.png`) offers only "Copy link" / "Send in a message" — far thinner than the Save/Comment/Duet-request pattern used elsewhere on the same card.

**Generic-AI tells checked against the guideline list:** no indigo/purple gradients found (good — teal accent used instead); no sparkle icons or emoji-as-icon; uniform 12–16px rounded corners on nearly every card is present but mild; three-feature-card rows and lorem-ipsum copy were not observed.

## (c) Scorecard

| Screen | Score /10 | Why |
|---|---|---|
| Login | 6 | Clean, minimal; hydration-mismatch error; no differentiation from a generic auth template |
| Onboarding | n/a | Not present — correct per 2026 guidance (skip a flow, teach through doing) |
| Home | 5 | Empty state is well-written but the screen is otherwise just one card |
| Explore | 3 | 6 of 7 tabs permanently broken; only tab that works is fine |
| Search | 4 | Works, but leaks "(spec §24)" engineering text to real users |
| Create – Record | 5 | Clean UI; no countdown, no headphone prompt, dead-end mic-denied error |
| Create – Upload | 6 | Drag/drop + format list is clear and functional |
| Wave page | 5 | Functional; dev-speak copy; waveform barely visible |
| Player | 4 | Waveform is a flat line, not a real waveform; scrub affordance unclear |
| Comments | 6 | Basic, works, good empty state |
| Share sheet | 3 | Only two options; one is obscured by the stuck loading pill in evidence |
| Profile | 6 | Clean header, clear counts, consistent |
| Notifications | 6 | Excellent empty-state copy |
| Messages | 6 | Good privacy-forward empty state, clear value prop |
| Duets (requests) | 6 | Clear Received/Sent split, good empty state |
| Settings hub | 7 | Well organized, helper subtext on every row |
| Settings subsections | 6–7 | Appearance (7, genuine differentiator) and Privacy (6, granular) strongest |
| Analytics | 5 | Data is legible but "Meaningful/Raw" jargon and all-zero state undercut trust |

## (d) Top 10 fixes for the first 5 minutes (ranked)

1. Fix Explore's New/Rising/Original/Voices/Compositions/Open-for-Duet tabs — it's the only discovery surface a cold-start user has.
2. Delete all internal/engineering copy from user-facing UI ("spec §24", "Enforced server-side, not just hidden in the UI", "Meaningful/Raw" tags).
3. Find and kill the stuck "Rendering…" pill that overlaps the bottom nav and the share sheet.
4. Fix desktop sign-out so it redirects to `/login` instead of leaving the user on `/analytics`.
5. Fix the login-page SSR/client hydration mismatch before it ships.
6. Fix the notification-badge HEAD request that fails on nearly every navigation.
7. Make the waveform actually look and behave like a waveform (visible bars, loaded/unloaded distinction), not a flat progress line.
8. Add the 3-second countdown and a "best with headphones" prompt before recording — table stakes against Smule/TikTok.
9. Fix the desktop layout's dead right-hand space so a 1280px+ viewport doesn't look unfinished.
10. Give the mic-denied error an actual fix path (settings link or a one-tap fallback to Upload).

## (e) What's genuinely good — keep it

- **No-likes stance is real and visible**, not just marketing ("No Likes — ever." on Analytics) — matches the market research's #1 documented user complaint about the category (harassment/vanity metrics) and differentiates from TikTok/Smule.
- **Empty-state writing is excellent everywhere** — every empty state names what belongs there and gives one concrete next action, exactly per the 2026 checklist, and better than most funded competitors.
- **Profile "Appearance" theming** (Ink/Slate/Sand/Mist/Plum/Forest + 5 gradient presets) is a distinctive, non-generic personalization feature most singing/duet apps don't offer.
- **Teal accent instead of the indigo/purple AI-slop default** — a genuine, deliberate taste choice per the guideline's own anti-slop checklist.
- **Granular, clearly-worded privacy controls** (who can message/duet/comment by default, private-account toggle, data export) are ahead of where most week-one social MVPs are.
- **Honest processing state** ("Still processing — playback works now with the original file") sets correct expectations instead of blocking the user — good practice, keep the pattern.
- **Settings information architecture** is clean, consistently labeled, with helper subtext under every row.

## (f) Overall first impression: 5.5/10

AKINTI's underlying product decisions — the no-likes stance, granular privacy, the teal-not-indigo palette, and genuinely well-written empty states — show more taste than a typical week-one MVP and would read fine next to BandLab's understated utility. But the two things an audio-social app absolutely cannot get wrong — discovery (Explore, 6 of 7 tabs dead) and playback (a waveform that isn't visibly a waveform) — are exactly the two that are currently broken or missing, which is fatal next to Smule's async-duet discovery engine and Voloco's waveform-centric "wow in 30 seconds" moment. Internal engineering copy bleeding into Search and Privacy, plus a stuck loading indicator sitting on top of real controls, make the build read as an unfinished dev artifact rather than a shippable product — the opposite of the polish bar TikTok and BandLab have set for this category.
