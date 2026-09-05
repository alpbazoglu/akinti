# AKINTI — Market, Product, Monetization, Turkey and AI-Audio Research (Sept 2026)

Compiled from five parallel research agents (web sources, Sept 2026). Founder decisions on top: brand AKINTI, object term "Wave", no Likes, English UI first (Turkish localization planned), Duet is the core loop.

---

## 1. Competitors: what worked, what failed

| App | Scale / facts | Core loop | Money | Lesson |
|---|---|---|---|---|
| Smule | ~52M MAU / $101M rev (2016); VIP ~80% of revenue; steep decline after 2018 | solo → async Duet (open call) → share | VIP sub $40–50/yr + coins | Async duets sustain engagement; no second growth wave after novelty faded |
| BandLab | 100M+ users, 15M tracks/month (2024) | free DAW + social + Fork | indirect (parent hardware/ads), Membership, licensing, Airbit | A genuinely useful creation tool retains better than a social wrapper |
| SoundCloud | $485M rev 2025, 18M subs | upload/stream/comment | subs; 2025 gave artists 100% distribution royalties | Gatekept monetization throttles uploads; opening it reignited growth |
| Voisey | Snap bought 2020, killed 2022 | sing over producer loops, split screen | none | Non-core to parent → killed regardless of traction |
| Clubhouse | 10M WAU peak, downloads 41M→3M, revenue ~0 | live rooms | none built | Live-only collapses when forcing event ends; monetize during growth |
| Stationhead | 5–7M users, $12M raise | listening parties synced to Spotify | industry-backed | Tie loop to something industry pays for |
| StarMaker | ~35M Android MAU, ~19% karaoke share | karaoke + duets | VIP + coins/gifts | Category is not winner-take-all |
| WeSing (Tencent) | 225M DAU 2019, 77% CN share, growth plateaued | karaoke | gifting (70%+ of TME revenue historically) | Even winners plateau; need second layer (gifting, rooms) |
| Yalla (MENA) | $340M rev 2024, 66% voice rooms, 41M MAU, payers +3% | voice rooms + gifts | gifting | Gifting scales revenue via small paying minority |
| Bigo Live | 377M MAU; Turkey = #2 traffic source (12%) | live video/audio + gifts | gifting; 4.4% payer conversion | Turkish users already pay for voice performance |
| TikTok Duet/Stitch | Duet ~5.3% ER, Stitch +35% engagement | algorithmic feed | ads/gifts | Discovery engine matters as much as recording |
| Splice | 2.5M users, 75% subs | samples/plugins | subs $13–40/mo | Monetize inputs (tools/sounds), clean economics |
| Suno/Udio 2025–26 | community feeds, remix, Suno Studio DAW, Warner license | AI generate + share | subs | AI generators are becoming adjacent competitors |

**Survivor patterns:** async > live-only; monetize the transaction (gifts, tools, sounds) not just the network; a useful standalone tool survives platform risk; category plateaus need a second layer; discovery infrastructure is as important as the recorder.
**Death causes:** no monetization during growth; parent deprioritization; live-synchronous dependency.

Sources: hypebot.com (Smule 2017), musictech.com (BandLab 100M), musicbusinessworldwide.com (SoundCloud 2025), techcrunch.com & musically.com (Voisey), influencermarketinghub.com (Clubhouse), prnewswire.com (Stationhead, Yalla FY2024), qz.com (WeSing), streamhatchet.com (Bigo), amraandelma.com (TikTok duet stats), statista.com (Splice).

---

## 2. What users love / hate (reviews, Reddit, Ekşi Sözlük)

Ranked by retention impact × feasibility:
1. **Instant vocal effects on first recording** (reverb/compression/autotune). Voloco 4.8★/84k ratings built on it. Aha-moment in session 1 → 2.4× conversion; Day-0 aha retains 57% vs 4% (Userpilot 2026). → Auto-apply a tasteful default polish before the user picks anything.
2. **Async Duets** — most-cited "love" driver on Smule; Ekşi Sözlük users call duets/live jam "addictive".
3. **Live pass-the-mic** (Smule LiveJam) — later differentiator.
4. **Backing track / beat library** — Rapchat: "beat library removes the most annoying step". Solves the blank-page problem so a Duet doesn't require a partner first.
5. **Fork / remix without permission** (BandLab Fork, Suno Remix) → duet chains: A→B→C as a tree.
6. **Open verse / open call challenges** with weekly prompt + simple leaderboard.
7. **Forgiving streaks** (freeze days): +40–60% DAU when combined with milestones (Plotline 2026).
8. **Structured critique-for-critique feedback** (r/WeAreTheMusicMakers weekly threads, Discord 1:1 feedback servers) — amateurs want specific feedback, not likes.
9. Vocal remover/practice tools (Moises) — heavier tech, later.
10. Duet/Stitch-style virality — make Duet the default share unit.

**Users hate:** pay-to-be-recommended and bait notifications (StarMaker), fake accounts/bot comments (Ekşi on StarMaker), harassment killing confidence (Smule forums) → supports no-likes design, cold start with no listeners, latency/sync bugs ("3–4 beats behind"), removing free features behind paywalls after habit forms.

**Month-1 experiments:** default polish on every recording; weekly themed Duet prompt with curated top-5; duet-chain forking; 3-field structured comment template rewarded with visibility; streak with 1 freeze/week.

Sources: apps.apple.com (Voloco, Rapchat, Volmix, Podiums), userpilot.com, venturebeat.com (Smule duets), variety.com (LiveJam), blog.bandlab.com (Fork), alternativeto.net (Suno remix), plotline.so, gummysearch.com, indiemusicianresources.com, unstar.app (StarMaker 2026), eksisozluk.com (smule, starmaker), sing.salon forums.

---

## 3. Monetization: what actually sells

Ranked mechanisms:
1. **Paid AI vocal processing subscription** (Voloco $10–12/mo, Moises $4–10, LALAL $15–35). Sells better-sounding vocals, not content. Best first test.
2. **VIP/Premium bundle** (Smule VIP $40–50/yr: exclusive content, ad-free, featured slots, artist duets).
3. **Virtual gifting / coin economy** — largest revenue category in voice social; Turkey is Bigo's #2 market; Yalla 36% operating margin. Needs KYC/payout rails; do second.
4. **Creator subscriptions / tipping** (Patreon $2B/yr to creators, Ko-fi 0–5% take; avg tip $3–7).
5. **Contests with prizes** (Smule monthly challenges → VIP trial + sponsorship line).
6. **Paid collaboration marketplace** (SoundBetter ~8% take) — needs liquidity, not v1.
7. **B2B talent-scouting data** for labels — needs scale.
8. **Sync licensing of original user recordings** — only originals, at scale.

**Traps:** karaoke catalog licensing (per-play royalties, Smule's costs +10–20%/yr) → rely on user-uploaded originals/instrumentals and royalty-free backing tracks; ads at small scale (<$1 CPM, hurts retention; needs 10k+ DAU); bare "tip $1" button without coin/status mechanics converts poorly; freemium conversion realistic at ~2–5% (RevenueCat 2026 avg 2.1%); Turkey ARPU well below US — price in TRY tiers, expect IAP/gifting > subscriptions.

**First monetization to test:** VIP at $3–5/mo (discounted TRY tier) bundling AI vocal effects + unlimited saves/ad-free + one featured Duet slot/month. No payout infra needed, no licensing cost, proven analogue (Voloco/Moises). Add gifting on Duets/performances once payer data exists.

Sources: sing.salon (VIP pricing), anditasten.de, businessmodelcanvastemplate.com (Smule), fool.com & cnbc.com (TME/WeSing), statista.com (live-stream IAP), bittopup.com (Bigo Turkey), gulfnews.com & finance.yahoo.com (Yalla), blog.bandlab.com, musicbusinessworldwide.com & billboard.com (SoundCloud FPR), bloggingwizard.com (Patreon), creatorrevenuecalculator.com (Ko-fi), gearspace.com (SoundBetter take), ascap.com, bloomvocal.site (Voloco), stemsplit.io, artisangrowthstrategies.com & RevenueCat (conversion), gamedevreports.substack.com (Turkey mobile), monetizemore.com (ads).

---

## 4. Turkey: opening, regulation, go-to-market

- 62.3M social identities (71% pop.), 2h43m/day social (above global 2h21m); Instagram 62M, YouTube 58M, TikTok 45M (18–34 skew). (DataReportal 2026)
- Spotify TR 2025 top-100 is 98% domestic; rap/trap leads youth (Lvbel C5, BLOK3, Sefo, Semicenk); cover culture is a recognized TikTok/IG genre; talent shows (Yetenek Sizsiniz returned 2025, O Ses Türkiye) clip straight to Reels/TikTok.
- No dominant Turkish-first singing/voice social app: Smule/StarMaker localized but generic; fizy (Turkcell) and Muud (Türk Telekom) are streaming, not UGC. Distribution is commoditized (Netd, DMC, MüzikYolu) → bottleneck is discovery, collaborators, audience.
- Turkish youth already pay for voice performance (TikTok LIVE gifts, Bigo/Tango "sanal pavyon" phenomenon).
- **Regulation:** Law 5651 obligations kick in at >1M daily domestic access (local representative, BTK registration, 72h takedown, fines ₺100k–₺5M); BTK blocking powers expanding (2025–26); KVKK: platform is "veri sorumlusu" (aydınlatma, VERBİS, breach notice); copyright bodies MESAM/MSG (authors), MÜYAP (producers), MÜYORBİR (performers) — negotiate a blanket UGC license before scale; unlicensed backing tracks in Duets are the biggest exposure.
- **90-day plan to 10k users (~₺220–300k):** days 1–20 seed 300–500 real musicians (conservatories: İTÜ TMDK, Hacettepe, MSGSÜ, Ankara; university music clubs; Discord servers; IG/TikTok cover pages); days 15–40 40–60 micro-creators at ₺750–2,500/post + "Cypher Haftası"; days 30–60 talent-show spillover (invite eliminated contestants, verified profiles); days 45–75 genre-native weekly challenges ("Türkü Düeti", "Atışma Modu", "Cypher", "Arabesk Gecesi") cross-posted as waveform clips; days 60–90 paid TikTok/IG tests (₺50–80k) + 2–3 offline meetups.
- **Localization decisions:** Atışma Modu (aşık atışması call-and-response duet), Cypher mode (sequential-verse group duet), Turkey-native genre taxonomy (pop, rap/trap, arabesk, türkü/halk, rock), Turkish-first UX + moderation copy, saves/shares economy designed to accept a gifting layer later.

Sources: datareportal.com (Digital 2026 Turkey), gazetemerhaba.com, habercigazetesi.net & rapkology.com (Spotify Wrapped TR 2025), firsat.me (cover trends), turkinform.com.tr (Yetenek Sizsiniz), apps.apple.com/tr (Smule), turkcell.com.tr (fizy), turktelekom (Muud), netdbasvuru.com, milliyet.com.tr (TikTok jeton), newslabturkey.org (Tango/Bigo), mondaq.com & kavlak.av.tr (5651), karar.com (BTK), kvkk.gov.tr, mesam.org.tr, disboard.org (müzisyen Discords), turkishmusicportal.org (conservatories), cremicro.com & tuberajans.com (influencer prices), dergipark.org.tr (atışma tradition).

---

## 5. AI / audio tech: "wow in 30 seconds" shortlist

| # | Feature | Approach | Build | Cost/min | Legal |
|---|---|---|---|---|---|
| 1 | One-tap pitch snap (autotune) | pyworld/CREPE-lite + PSOLA, key auto-detect; Python microservice next to ffmpeg worker | 1.5 wk | ~$0.001 (CPU) | none |
| 2 | Vocal cleanup (denoise + de-reverb) | DeepFilterNet3 (beats RNNoise on non-stationary noise), MIT | 1 wk | ~$0.001 | none |
| 3 | One-tap mastering | Matchering (open source) vs 3–5 genre references; Auphonic API fallback ($0.02/min) | 4–5 days | ~$0.001 | none |
| 4 | Pitch-accuracy "vocal coach" score | CREPE (~85% acc) or pYIN vs reference melody; cents-deviation score overlay | 1.5–2 wk | ~$0.001 (+Demucs ~$0.005 if stems needed) | none |
| 5 | Self-harmony ("duet with yourself") | pitch-shift copy of own vocal at key-valid interval, formant-preserved | ~2 wk | ~$0.001 | low (own voice) |

**Do not build now:** RVC/so-vits voice conversion of other people (publicity-rights case law 2026); Suno/Udio backing tracks (no commercial API, ToS); self-hosted MusicGen (weights CC-BY-NC); LANDR API (enterprise only); real-time sub-20ms live correction (offline flow doesn't need it); custom audiogram SaaS (ffmpeg `showwaves`/`showspectrum` does it).

Cost at 10k recordings/month (~30k min): each self-hosted DSP feature ~$30; hosted fallbacks ~$600; stem-separation API $1.5–6k; Whisper transcription ~$180 (API) or ~$90 self-hosted.

Sources: github.com (autotalent, pyworld, matchering, lars76/pitch-benchmark), patents.google.com (Smule PSOLA), rysupaudio.com (free autotune 2026), publikasi.mercubuana.ac.id (DeepFilterNet vs RNNoise 2025), auphonic.com/pricing, aitoolsdevpro.com (Adobe Enhance API), arxiv.org/2206.14357 (pitch trackers), sonarworks.com & kits.ai (harmony), wipo.int & soundverse.ai (voice-clone law 2026), gptproto.com (Suno API status), falcon.so (MusicGen license), landr.com, lalal.ai/pricing, sonilo.com (music.ai), costbench.com (Whisper), gigagpu.com, runpod.io.

---

## 6. Live UX audit (partial — agent interrupted by network outage)

- Confirmed real bug: `/analytics` fails to load (needs console/network investigation).
- Founder's verdict on the current build: "mediocre and not working". Full audit to be re-run.
