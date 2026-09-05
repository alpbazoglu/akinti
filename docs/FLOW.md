# Flow — the full-screen listening feed (founder decision, 6 Sept 2026)

The founder asked for the app to pull people in and keep them there, "like Reels". Flow is AKINTI's answer: a full-screen, one-Wave-per-screen vertical feed that plays continuously. It becomes the default screen after login (Home keeps the follow-only list as a tab or secondary route).

## Non-negotiables carried over
- No Likes. Reactions are Replay, Save, Comment, Share, Duet.
- First sound needs one gesture (browser rule); after that Flow plays continuously and advances on its own.
- No fake counts, no confetti, no badges. Retention comes from good next Waves, fast Duet, and honest "new for you" counts.
- Design: waterline is the visual; colour per COLOR_V2.md; no cards, no gradients, no purple.

## The screen (390×844 first)
- One Wave fills the viewport (100dvh, safe areas). Ground is tinted paper; the Wave's trace is drawn large and live: a `waterline` that reacts to the audio (analyser on the single global playback element) with linear motion; played part in Signal.
- Top: creator handle · title · one metadata line (mode/genre mark, duration in Martian Mono). Tap handle → profile.
- Right rail (thumb zone, largest targets): Replay, Save, Comment (opens sheet), Share, **Duet** (the hero action; open-for-Duet mark in Signal when the creator invites).
- Bottom: transport (play/pause largest target), scrub on the trace, "Up next" hairline strip showing the next trace faintly.
- Gestures: swipe up = next, swipe down = previous, double tap = Replay (never Like), long press = Save, tap = pause/play. Keyboard: ↑/↓, space.
- Auto-advance when a Wave ends (linear, no bounce). Prefetch signed URLs and peaks for the next 2 Waves; keep the previous one warm.
- Continuous playback: leaving Flow keeps the persistent player.

## Ranking (server RPC `get_flow_page(cursor, seed)`)
Session-seeded mix, keyset paginated, never repeats within a session:
1. Waves from followed creators not yet heard (newest first).
2. Answers to the viewer's Open Calls and Duets of their Waves.
3. Live challenge entries and curated Top 5.
4. Rising Waves (plays + replays + saves + duets in last 48h, decayed), diversified by creator and genre.
5. Backing-track and Open Call invitations every ~8th slot ("Sing over this").
Heard state is recorded server-side (existing play counting); "new for you" count = items in 1–3 unheard.

## Retention hooks (honest)
- "New for you" number on the Flow tab icon (never zero shown).
- Daily push digest (existing push infra): "3 new answers to your Open Call".
- After the viewer's first Duet: prompt to invite one friend (share card).
- Listening streak is NOT in scope (DESIGN §12 rule 35); revisit only with data.

## Engineering
- Route `src/app/(app)/flow/**`, components `src/components/flow/**`, helper `src/lib/db/flow.ts`, migration for `get_flow_page` and a `flow_impressions` table (user_id, wave_id, seen_at; RLS owner-only) to avoid repeats.
- Uses the single playback store; the big trace uses an `AnalyserNode` attached to the store's media element (create once, reuse).
- Virtualised: render current ±1 only. `next/dynamic` for the comment sheet and share sheet.
- Performance: first Wave server-rendered with peaks; audio starts on the first gesture; INP < 200 ms on swipe.
- Analytics: impressions, completes, skips (position), replays, saves, duet taps → existing metrics tables or a `flow_events` table.
