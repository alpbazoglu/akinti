"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Waveform, WaveformCanvas, placeholderPeaks, type TraceHue } from "@/components/audio";
import { PageHeader } from "@/components/layout";
import { BottomNav } from "@/components/layout/BottomNav";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  CountBadge,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Menu,
  RecordKey,
  Select,
  Sheet,
  Skeleton,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  tabId,
  tabPanelId,
  useToast,
  type RecordKeyState,
} from "@/components/ui";
import { Bookmark, MessageSquare, Play, Share2 } from "@/components/ui/icons";
import { WaveCard, WaveCardSkeleton, WaveSeparator } from "@/components/wave";
import { BRAND, TERMS } from "@/config/terminology";
import { contrastRatio } from "@/lib/ui";

/**
 * The living style guide (`docs/design/DESIGN.md`).
 *
 * Every token and every component in one place, in both themes, so a drift —
 * a new radius, a pill, a shimmer, an accent that left audio state — is
 * visible in one screen rather than discovered in production. `page.tsx` 404s
 * this route in production, so it never ships as a public surface.
 */

const DEMO_PEAKS = placeholderPeaks(160, 7);
const DEMO_PEAKS_B = placeholderPeaks(160, 23);

/** The §3.2 regression string, checked at 11px, 16px and 40px in both faces. */
const REGRESSION = "AKINTI · kayıt akışı düğümü · ŞİŞLİ İĞNE · 0:14 / 2:07 · -18.2 dB";

const TYPE_SCALE: readonly { token: string; spec: string; className: string }[] = [
  { token: "display-xl", spec: "40 / 40 · 600 · wdth 112 · -0.025em", className: "type-display-xl" },
  { token: "display", spec: "32 / 34 · 600 · wdth 108 · -0.022em", className: "type-display" },
  { token: "title", spec: "28 / 30 · 600 · wdth 100 · -0.02em", className: "type-title" },
  { token: "heading", spec: "19 / 24 · 600 · wdth 100 · -0.015em", className: "type-heading" },
  { token: "subhead", spec: "15 / 20 · 600 · wdth 100 · -0.006em", className: "type-subhead" },
  { token: "body", spec: "16 / 25 · 400 · wdth 100 · -0.002em", className: "type-body" },
  { token: "body-sm", spec: "14 / 20 · 400 · wdth 100 · 0", className: "type-body-sm" },
  { token: "caption", spec: "13 / 17 · 500 · wdth 100 · +0.004em", className: "type-caption" },
  { token: "micro", spec: "11 / 14 · 500 · wdth 100 · +0.02em", className: "type-micro" },
];

const MONO_SCALE: readonly { token: string; spec: string; className: string }[] = [
  { token: "mono-display", spec: "44 / 44 · 500 · wdth 87.5", className: "type-mono-display" },
  { token: "mono-lg", spec: "22 / 26 · 500 · wdth 87.5", className: "type-mono-lg" },
  { token: "mono", spec: "15 / 18 · 500 · wdth 87.5", className: "type-mono" },
  { token: "mono-sm", spec: "12 / 15 · 500 · wdth 87.5", className: "type-mono-sm" },
];

/** docs/design/COLOR_V2.md — tinted water grounds and the current, the brand hue. */
const LIGHT_SWATCHES: readonly { token: string; hex: string; use: string }[] = [
  { token: "paper", hex: "#E9EFEC", use: "The page. Every screen." },
  { token: "paper-raised", hex: "#DEE7E3", use: "Sheets, rails and inputs (\"paper-2\")." },
  { token: "paper-sunk", hex: "#D3E0D9", use: "Pressed rows, inset fields." },
  { token: "ink", hex: "#0F1A18", use: "Body, headlines, glyphs, playheads." },
  { token: "ink-muted", hex: "#33443F", use: "Secondary prose, meta." },
  { token: "ink-subtle", hex: "#4E625C", use: "Captions, counts, timestamps." },
  { token: "hairline", hex: "#C3D1CB", use: "Row dividers, input borders." },
  { token: "hairline-strong", hex: "#A9BDB4", use: "Line keys, the dormant tick row." },
  { token: "current", hex: "#0E6B6B", use: "Idle trace, primary keys, links, focus, active underline." },
  { token: "current-2", hex: "#0A4F50", use: "Pressed/hover depth of the current." },
  { token: "foam", hex: "#B9DED8", use: "Subtle fills. Unplayed trace on dark, not here." },
  { token: "sand", hex: "#8C6418", use: "Backing-track marks, Cypher order, warnings." },
  { token: "danger", hex: "#9A2E1E", use: "Destructive/error text and hairlines only, never a fill." },
  { token: "signal", hex: "#DE3C11", use: "Graphic only. Live audio, nothing else." },
];

const DARK_SWATCHES: readonly { token: string; hex: string; use: string }[] = [
  { token: "paper", hex: "#0F1614", use: "The page." },
  { token: "paper-raised", hex: "#16201D", use: "Sheets, rails and inputs (\"paper-2\")." },
  { token: "paper-sunk", hex: "#0B100E", use: "Pressed rows, inset fields." },
  { token: "ink", hex: "#E6EFEC", use: "Body, headlines, glyphs, playheads." },
  { token: "ink-muted", hex: "#B8C8C2", use: "Secondary prose." },
  { token: "ink-subtle", hex: "#8FA39C", use: "Captions." },
  { token: "hairline", hex: "#243330", use: "Row dividers." },
  { token: "hairline-strong", hex: "#33463F", use: "Line keys, idle ticks." },
  { token: "current", hex: "#3FB5B0", use: "Idle trace, primary keys, links, focus, active underline." },
  { token: "current-2", hex: "#2B8D89", use: "Pressed/hover depth of the current." },
  { token: "foam", hex: "#3E7972", use: "The unplayed trace on dark." },
  { token: "sand", hex: "#E0B25A", use: "Backing-track marks, Cypher order, warnings." },
  { token: "danger", hex: "#F07A62", use: "Destructive/error text and hairlines only, never a fill." },
  { token: "signal", hex: "#FF5C33", use: "Live audio." },
];

/** Every `TraceHue` (`docs/design/COLOR_V2.md` "Colour by mode and genre"), so a drift between a mode/genre label and its actual token shows up here first. */
const HUES: readonly { hue: TraceHue; label: string }[] = [
  { hue: "current", label: "the default — Layer Duet, and everything else" },
  { hue: "atisma", label: "Atışma reply segments (reed green)" },
  { hue: "cypher-1", label: "Cypher verse 1 (the current)" },
  { hue: "cypher-2", label: "Cypher verse 2 (reed green)" },
  { hue: "cypher-3", label: "Cypher verse 3 (sand)" },
  { hue: "cypher-4", label: "Cypher verse 4 (deep-water blue, hue < 225°)" },
  { hue: "genre-pop", label: "genre tint — pop" },
  { hue: "genre-rap", label: "genre tint — rap/trap" },
  { hue: "genre-arabesk", label: "genre tint — arabesk" },
  { hue: "genre-turku", label: "genre tint — türkü/halk" },
  { hue: "genre-rock", label: "genre tint — rock" },
];

const RADII: readonly { token: string; value: string; means: string }[] = [
  { token: "line", value: "0", means: "a line" },
  { token: "label", value: "2px", means: "a label" },
  { token: "tag", value: "6px", means: "a tag" },
  { token: "field", value: "10px", means: "you can type in it" },
  { token: "key", value: "14px", means: "you can press it" },
  { token: "object", value: "16px", means: "a bounded object" },
  { token: "sheet", value: "24px", means: "it slid up from the bottom" },
];

const DEMO_WAVE = {
  id: "kit-demo",
  title: "Sabah provası",
  description: "İkinci köprüyü bir daha denedim. Nefes yerleri hâlâ dar.",
  // A fixed instant, not `Date.now()`: a gallery that rerenders with a new
  // timestamp on the client hydrates with a mismatch every time.
  createdAt: "2026-09-05T09:20:00.000Z",
  creator: { username: "aysek", displayName: "Ayşe Kaya" },
  creationType: "recorded" as const,
  audioUrl: "",
  peaks: DEMO_PEAKS,
  duration: 127,
  metrics: { plays: 312, replays: 41, comments: 0, saves: 0, shares: 0, duets: 6 },
};

export function KitGallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState("trending");
  const [tab, setTab] = useState("waves");
  const [switched, setSwitched] = useState(true);
  const [recordState, setRecordState] = useState<RecordKeyState>("idle");
  const [note, setNote] = useState("");
  const { toast } = useToast();

  // The gallery pins the theme so both palettes can be screenshotted; the rest
  // of the product resolves it from `prefers-color-scheme` plus Settings.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const swatches = theme === "dark" ? DARK_SWATCHES : LIGHT_SWATCHES;
  const ground = theme === "dark" ? "#0F1614" : "#E9EFEC";

  return (
    <div className="min-h-dvh bg-paper pb-32">
      <PageHeader
        title={`${BRAND} kit`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "Gece" : "Gündüz"}
          </Button>
        }
      />

      <div className="flex flex-col gap-16">
        <Section title="Type" note="Archivo Variable · Martian Mono Variable">
          <p className="type-caption text-ink-subtle">Regression string, three sizes</p>
          <div className="flex flex-col gap-3 border-y border-hairline py-5">
            <p className="type-micro text-ink">{REGRESSION}</p>
            <p className="type-body text-ink">{REGRESSION}</p>
            <p className="type-display text-ink">{REGRESSION}</p>
            <p className="type-mono text-ink">{REGRESSION}</p>
          </div>

          <div className="flex flex-col divide-y divide-hairline">
            {TYPE_SCALE.map((row) => (
              <div key={row.token} className="flex flex-col gap-1 py-4">
                <div className="flex items-baseline gap-3">
                  <span className="type-caption text-ink-subtle">{row.token}</span>
                  <span className="type-mono-sm text-ink-subtle">{row.spec}</span>
                </div>
                <p className={`${row.className} text-ink`}>Sabah provası · ŞİŞLİ</p>
              </div>
            ))}
            {MONO_SCALE.map((row) => (
              <div key={row.token} className="flex flex-col gap-1 py-4">
                <div className="flex items-baseline gap-3">
                  <span className="type-caption text-ink-subtle">{row.token}</span>
                  <span className="type-mono-sm text-ink-subtle">{row.spec}</span>
                </div>
                <p className={`${row.className} text-ink`}>0:14 / 2:07 · -18.2 dB</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Palette"
          note={theme === "dark" ? "Gece · contrast on #0F1614" : "Gündüz · contrast on #E9EFEC"}
        >
          <ul className="flex flex-col divide-y divide-hairline">
            {swatches.map((swatch) => {
              const ratio = contrastRatio(swatch.hex, ground);
              return (
                <li key={swatch.token} className="flex items-center gap-4 py-3">
                  <span
                    aria-hidden="true"
                    style={{ background: swatch.hex }}
                    className="size-10 shrink-0 rounded-label border border-hairline"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="type-subhead text-ink">{swatch.token}</span>
                    <span className="type-caption text-ink-subtle">{swatch.use}</span>
                  </span>
                  <span className="type-mono-sm shrink-0 text-ink-muted">
                    {swatch.hex.toLowerCase()}
                  </span>
                  <span className="type-mono-sm w-14 shrink-0 text-right text-ink-muted">
                    {ratio.toFixed(2)}:1
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Radius" note="Radius encodes role, never taste">
          <ul className="flex flex-wrap gap-5">
            {RADII.map((radius) => (
              <li key={radius.token} className="flex w-32 flex-col gap-2">
                <span
                  aria-hidden="true"
                  style={{ borderRadius: radius.value }}
                  className="block h-16 w-full border border-hairline-strong"
                />
                <span className="type-caption text-ink">{radius.token}</span>
                <span className="type-mono-sm text-ink-subtle">{radius.value}</span>
                <span className="type-caption text-ink-subtle">{radius.means}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Keys" note="Ink · line · text. No pills, ever.">
          <div className="flex flex-wrap items-end gap-4">
            <Button size="lg">Publish</Button>
            <Button variant="secondary">Re-record</Button>
            <Button variant="ghost">Skip this step</Button>
            <Button variant="danger">Delete my account</Button>
            <Button size="sm" loading>
              Saving
            </Button>
            <Button size="xs" variant="secondary">
              Compact
            </Button>
            <Button disabled>Disabled</Button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <IconButton label="Play" icon={<Play className="size-6" weight="fill" />} variant="primary" shape="round" size="lg" />
            <IconButton label={TERMS.comment} icon={<MessageSquare className="size-5" />} />
            <IconButton label={TERMS.save} icon={<Bookmark className="size-5" weight="fill" />} />
            <IconButton label={TERMS.share} icon={<Share2 className="size-5" />} />
            <IconButton label="Secondary" icon={<Play className="size-5" />} variant="secondary" />
          </div>

          <div className="flex flex-wrap items-end gap-6">
            {([96, 88, 72, 44, 36] as const).map((size) => (
              <div key={size} className="flex flex-col items-start gap-2">
                <RecordKey
                  label={`${TERMS.record}, ${size}px`}
                  size={size}
                  state={recordState}
                  onClick={() =>
                    setRecordState(recordState === "recording" ? "idle" : "recording")
                  }
                />
                <span className="type-mono-sm text-ink-subtle">{size}px</span>
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <span className="type-caption text-ink-subtle">state</span>
              <div className="flex gap-4">
                {(["idle", "armed", "recording", "paused"] as const).map((state) => (
                  <Chip
                    key={state}
                    selected={recordState === state}
                    onClick={() => setRecordState(state)}
                  >
                    {state}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Chips, tabs and badges" note="Active is a 2px current underbar">
          <div className="flex gap-5 overflow-x-auto">
            {["trending", "new", "rising", "open for duet"].map((value) => (
              <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>
                {value}
              </Chip>
            ))}
          </div>

          <Tabs
            idPrefix="kit-tabs"
            label="Kit tabs"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "waves", label: TERMS.waves, count: 12 },
              { value: "duets", label: TERMS.duets, count: 3 },
            ]}
          />
          <TabPanel
            id={tabPanelId("kit-tabs", tab)}
            labelledBy={tabId("kit-tabs", tab)}
            active
          >
            <p className="type-body-sm text-ink-muted">
              The panel body for {tab}.
            </p>
          </TabPanel>

          <div className="flex flex-wrap items-center gap-3">
            <Badge>Recorded</Badge>
            <Badge>Uploaded</Badge>
            <Badge>Duet</Badge>
            <Badge tone="signal">{TERMS.openForDuet}</Badge>
            <Badge size="md">Pending</Badge>
            <CountBadge count={3} label="unread messages" />
            <CountBadge count={128} label="unread notifications" />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <Avatar name="Ayşe Kaya" size={size} />
                <span className="type-mono-sm text-ink-subtle">{size}</span>
              </div>
            ))}
            <Avatar name="Deniz Arslan" size="md" ring />
          </div>
        </Section>

        <Section title="Inputs" note="Label above the field, always. Never a placeholder.">
          <div className="flex max-w-sm flex-col gap-6">
            <Input id="kit-title" label="Title" defaultValue="Sabah provası" />
            <Input id="kit-handle" label="Handle" defaultValue="aysek" confirmed />
            <Input
              id="kit-email"
              label="Email"
              type="email"
              defaultValue="not-an-email"
              error="Enter an email address we can reach you at."
            />
            <Textarea
              id="kit-note"
              label="Description"
              maxLength={280}
              showCount
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Select
              id="kit-category"
              label="Category"
              options={[
                { value: "voice", label: "Voice" },
                { value: "song", label: "Song" },
                { value: "composition", label: "Composition" },
              ]}
            />
            <Switch
              checked={switched}
              onCheckedChange={setSwitched}
              label="Allow Duet Requests"
              description="Anyone who can hear this Wave can ask to record against it."
            />
          </div>
        </Section>

        <Section title="Waterline" note="Every state of the one drawing">
          <TraceRow label="dormant · the recorder before you press anything">
            <Waveform peaks={[]} state="dormant" height={56} readOnly label="Dormant trace" />
          </TraceRow>
          <TraceRow label="loaded, unplayed · 56px, mirrored, bottom half at 70%">
            <Waveform peaks={DEMO_PEAKS} height={56} readOnly label="Unplayed trace" />
          </TraceRow>
          <TraceRow label="playing · played in Signal, 2px ink write-head, 60% buffered">
            <Waveform
              peaks={DEMO_PEAKS}
              progress={0.42}
              loaded={0.6}
              duration={214}
              height={56}
              readOnly
              label="Playing trace"
            />
          </TraceRow>
          <TraceRow label="recording · the whole trace in Signal, write-head at the right edge">
            <WaveformCanvas peaks={DEMO_PEAKS_B} state="recording" height={56} playhead />
          </TraceRow>
          <TraceRow label="duet · theirs in ink downward, yours in Signal upward, one playhead">
            <Waveform
              peaks={DEMO_PEAKS_B}
              duetPeaks={DEMO_PEAKS}
              state="duet"
              progress={0.55}
              height={96}
              readOnly
              label="Duet trace"
            />
          </TraceRow>
          <TraceRow label="detail · 144px, full bleed, 24px edge fade">
            <Waveform
              peaks={DEMO_PEAKS}
              progress={0.28}
              height={144}
              fullBleed
              readOnly
              label="Detail trace"
            />
          </TraceRow>
          <TraceRow label="inline · 28px, single-sided on a baseline">
            <Waveform peaks={DEMO_PEAKS} height={28} readOnly label="Inline trace" />
          </TraceRow>
          <TraceRow label="skeleton · a flat 6px waterline, no shimmer">
            <Skeleton shape="waterline" />
          </TraceRow>
          <TraceRow label="separator · drawn from the ending Wave's own peaks">
            <WaveSeparator peaks={DEMO_PEAKS} />
          </TraceRow>
        </Section>

        <Section
          title="Hues"
          note="docs/design/COLOR_V2.md — the unplayed trace only; played stays Signal"
        >
          {HUES.map((row) => (
            <TraceRow key={row.hue} label={`${row.hue} · ${row.label}`}>
              <WaveformCanvas peaks={DEMO_PEAKS} height={40} state="unplayed" hue={row.hue} />
            </TraceRow>
          ))}
        </Section>

        <Section title="Wave" note="Rail-hung, no card, non-zero metrics only">
          <div className="-mx-page">
            <WaveCard wave={DEMO_WAVE} />
            <WaveCardSkeleton />
          </div>
        </Section>

        <Section title="States" note="Left-aligned, with the real next action">
          <EmptyState
            title="No one you follow has posted yet."
            description="Waves from the people you follow land here."
            action={<Button size="sm">Find people to follow</Button>}
          >
            <div className="flex flex-col gap-4 border-y border-hairline py-4">
              <div className="flex flex-col gap-1">
                <span className="type-caption text-ink-muted">Ayşe Kaya · playing now</span>
                <Waveform peaks={DEMO_PEAKS} progress={0.3} height={28} readOnly label="Live trace" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="type-caption text-ink-muted">Deniz Arslan · playing now</span>
                <Waveform peaks={DEMO_PEAKS_B} progress={0.6} height={28} readOnly label="Live trace" />
              </div>
            </div>
          </EmptyState>

          <ErrorState
            title="Couldn't reach the stream."
            description="Check your connection and try again."
            onRetry={() => toast({ title: "Retrying." })}
          />

          <div className="flex flex-col gap-3">
            <Skeleton width="45%" />
            <Skeleton width="70%" />
            <Skeleton shape="waterline" />
          </div>
        </Section>

        <Section title="Sheet, menu and toasts" note="One ink strip, one line, one action">
          <div className="flex flex-wrap gap-4">
            <Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)}>
              Open the sheet
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast({ title: "Published." })}
            >
              Toast
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: "Upload didn't finish. Your recording is still here.",
                  tone: "error",
                  action: { label: "Try again", onClick: () => undefined },
                })
              }
            >
              Toast with an action
            </Button>
            <Menu
              label="Wave actions"
              items={[
                { id: "save", label: TERMS.save, onSelect: () => undefined },
                { id: "share", label: TERMS.share, onSelect: () => undefined },
                { id: "report", label: TERMS.report, destructive: true, onSelect: () => undefined },
              ]}
              trigger={(props) => (
                <Button {...props} variant="secondary" size="sm">
                  Menu
                </Button>
              )}
            />
          </div>

          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Share this Wave"
            description="The grabber is a waterline, not a grey capsule."
            footer={
              <Button fullWidth onClick={() => setSheetOpen(false)}>
                Done
              </Button>
            }
          >
            <div className="flex flex-col gap-4">
              <Waveform peaks={DEMO_PEAKS} height={32} readOnly label="Source clip" />
              <p className="type-body-sm measure text-ink-muted">
                A sheet is the default; a centred dialog only confirms something
                irreversible.
              </p>
            </div>
          </Sheet>
        </Section>

        <Section title="Keyboard" note="64px plus safe area, Record key on the bar">
          <div className="relative h-24 overflow-hidden border border-hairline">
            <BottomNav className="!absolute md:!block" />
          </div>
        </Section>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  note: string;
  children: ReactNode;
}

function Section({ title, note, children }: SectionProps) {
  return (
    <section className="akinti-page flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-title text-ink">{title}</h2>
        <p className="type-caption text-ink-subtle">{note}</p>
      </div>
      {children}
    </section>
  );
}

function TraceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-hairline pb-5">
      <span className="type-caption text-ink-subtle">{label}</span>
      {children}
    </div>
  );
}
