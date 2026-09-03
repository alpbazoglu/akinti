"use client";

import { useState, type ReactNode } from "react";
import {
  Bookmark,
  Compass,
  Flag,
  Handshake,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";

import { Waveform, WavePlayer, placeholderPeaks } from "@/components/audio";
import { PageHeader } from "@/components/layout";
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
  Kbd,
  Menu,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
  VisuallyHidden,
  tabId,
  tabPanelId,
} from "@/components/ui";
import { WaveCard, WaveCardSkeleton, type WaveCardWave } from "@/components/wave";
import { BRAND, CREATION_TYPES, TERMS } from "@/config/terminology";
import { cn, formatCount, formatDuration, timeAgo } from "@/lib/ui";

const DEMO_PEAKS = placeholderPeaks(72, 7);
const DEMO_PEAKS_B = placeholderPeaks(72, 23);

/** Silent one-second WAV, so the gallery never depends on a network asset. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

const DEMO_WAVE: WaveCardWave = {
  id: "demo-wave-1",
  title: "Late night take, one mic, no edits",
  description:
    "First pass at a verse I have been carrying around for a week. Open to a second voice on the chorus.",
  createdAt: Date.now() - 1000 * 60 * 47,
  creator: { username: "akin", displayName: "Akin" },
  collaborators: [
    { username: "maria", displayName: "Maria" },
    { username: "alex", displayName: "Alex" },
  ],
  creationType: "recorded",
  audioUrl: SILENT_WAV,
  peaks: DEMO_PEAKS,
  duration: 214,
  metrics: { plays: 12840, replays: 3120, comments: 84, saves: 512, shares: 96, duets: 7 },
  isSaved: false,
  canRequestDuet: true,
};

const DEMO_DUET: WaveCardWave = {
  ...DEMO_WAVE,
  id: "demo-wave-2",
  title: "Chorus answer",
  description: undefined,
  createdAt: Date.now() - 1000 * 60 * 60 * 26,
  creator: { username: "maria", displayName: "Maria" },
  collaborators: [],
  creationType: "duet",
  peaks: DEMO_PEAKS_B,
  duration: 96,
  metrics: { plays: 940, replays: 210, comments: 12, saves: 41, shares: 4, duets: 1 },
  isSaved: true,
  canRequestDuet: false,
};

export function KitGallery() {
  return (
    <div className="mx-auto w-full max-w-3xl pb-24">
      <PageHeader
        title={`${BRAND} UI kit`}
        description="Development-only gallery of every Stage 1 component. Not reachable in production."
      />
      <div className="flex flex-col gap-10 px-4 sm:px-5">
        <ButtonsSection />
        <IdentitySection />
        <FormsSection />
        <NavigationSection />
        <OverlaySection />
        <StatesSection />
        <AudioSection />
        <WaveSection />
        <TokensSection />
        <FormattersSection />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-[0.12em] text-fg-subtle uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        {children}
      </div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ButtonsSection() {
  return (
    <Section title="Buttons">
      <Row>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </Row>
      <Row>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Row>
      <Row>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button leadingIcon={<Handshake className="size-4" />}>{TERMS.requestDuet}</Button>
      </Row>
      <Row>
        <IconButton label="Save" icon={<Bookmark className="size-4" />} />
        <IconButton label="Save" icon={<Bookmark className="size-4" />} variant="secondary" />
        <IconButton label="Save" icon={<Bookmark className="size-4" />} variant="primary" />
        <IconButton label="Delete" icon={<Trash2 className="size-4" />} variant="danger" />
        <IconButton
          label="Explore"
          icon={<Compass className="size-4" />}
          variant="secondary"
          showLabel
        />
      </Row>
    </Section>
  );
}

function IdentitySection() {
  return (
    <Section title="Identity and labels">
      <Row>
        <Avatar name="Akin Yilmaz" size="xs" />
        <Avatar name="Maria" size="sm" />
        <Avatar name="Alex Rivera" size="md" />
        <Avatar name="Deniz" size="lg" ring />
        <Avatar name="Sam" size="xl" />
      </Row>
      <Row>
        <Badge>{TERMS.wave}</Badge>
        <Badge tone="accent" icon={CREATION_TYPES.recorded.glyph}>
          {CREATION_TYPES.recorded.label}
        </Badge>
        <Badge tone="accent" icon={CREATION_TYPES.uploaded.glyph}>
          {CREATION_TYPES.uploaded.label}
        </Badge>
        <Badge tone="accent" icon={CREATION_TYPES.duet.glyph}>
          {CREATION_TYPES.duet.label}
        </Badge>
        <Badge tone="success">{TERMS.openForDuet}</Badge>
        <Badge tone="warning">Processing</Badge>
        <Badge tone="danger">Failed</Badge>
        <CountBadge count={3} label="unread messages" />
        <CountBadge count={128} label="unread notifications" />
      </Row>
      <Row>
        <span className="text-sm text-fg-muted">
          Press <Kbd>Space</Kbd> to play, <Kbd>&larr;</Kbd> <Kbd>&rarr;</Kbd> to seek.
        </span>
      </Row>
      <Row>
        <Skeleton width="8rem" />
        <Skeleton shape="circle" />
        <Skeleton shape="block" width="10rem" />
        <Spinner />
        <VisuallyHidden>Hidden helper text for screen readers</VisuallyHidden>
      </Row>
    </Section>
  );
}

function FormsSection() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("everyone");
  const [autoplay, setAutoplay] = useState(true);
  const [duets, setDuets] = useState(false);

  return (
    <Section title="Forms">
      <Input
        id="kit-title"
        label={`${TERMS.wave} title`}
        placeholder="Give it a name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        hint="Shown at the top of the card."
      />
      <Input
        id="kit-search"
        label={TERMS.search}
        placeholder="Search creators"
        leadingIcon={<Search className="size-4" />}
      />
      <Input
        id="kit-error"
        label="Username"
        defaultValue="a"
        error="Usernames must be at least 3 characters."
      />
      <Textarea
        id="kit-description"
        label="Description"
        placeholder="Say something about this recording"
        maxLength={280}
        showCount
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Select
        id="kit-visibility"
        label={`${TERMS.wave} visibility`}
        value={visibility}
        onChange={(event) => setVisibility(event.target.value)}
        options={[
          { value: "everyone", label: "Everyone" },
          { value: "followers", label: TERMS.followers },
          { value: "only-me", label: "Only me" },
        ]}
        hint="Enforced server-side, never only here."
      />
      <Switch
        checked={autoplay}
        onCheckedChange={setAutoplay}
        label="Autoplay next Wave"
        description="Continue into the next Wave in the feed."
      />
      <Switch
        checked={duets}
        onCheckedChange={setDuets}
        label={`Accept ${TERMS.duetRequests}`}
        description="Anyone may ask to build on your Waves."
      />
    </Section>
  );
}

const TAB_ITEMS = [
  { value: "waves", label: TERMS.waves, count: 24 },
  { value: "duets", label: TERMS.duets, count: 6 },
  { value: "saved", label: TERMS.saved },
];

function NavigationSection() {
  const [tab, setTab] = useState("waves");
  const [segment, setSegment] = useState("trending");
  const [chips, setChips] = useState<string[]>(["trending"]);

  const toggleChip = (key: string) =>
    setChips((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  return (
    <Section title="Navigation">
      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onValueChange={setTab}
        label="Profile sections"
        idPrefix="kit-tabs"
      />
      {TAB_ITEMS.map((item) => (
        <TabPanel
          key={item.value}
          id={tabPanelId("kit-tabs", item.value)}
          labelledBy={tabId("kit-tabs", item.value)}
          active={tab === item.value}
          className="text-sm text-fg-muted"
        >
          {item.label} panel content.
        </TabPanel>
      ))}

      <Tabs
        items={[
          { value: "trending", label: "Trending" },
          { value: "new", label: "New" },
          { value: "rising", label: "Rising" },
        ]}
        value={segment}
        onValueChange={setSegment}
        label="Explore ranking"
        variant="segmented"
        idPrefix="kit-segment"
        className="self-start"
      />

      <Row>
        {[
          ["trending", "Trending"],
          ["new", "New"],
          ["original", "Original"],
          ["open-for-duet", TERMS.openForDuet],
        ].map(([key, label]) => (
          <Chip key={key} selected={chips.includes(key)} onClick={() => toggleChip(key)}>
            {label}
          </Chip>
        ))}
      </Row>

      <Menu
        label="Wave actions"
        items={[
          { id: "save", label: TERMS.save, icon: <Bookmark className="size-4" />, onSelect: () => {} },
          { id: "report", label: "Report", icon: <Flag className="size-4" />, onSelect: () => {} },
          {
            id: "delete",
            label: "Delete",
            icon: <Trash2 className="size-4" />,
            destructive: true,
            onSelect: () => {},
          },
        ]}
        trigger={(props) => (
          <IconButton
            {...props}
            label="More"
            variant="secondary"
            icon={<MoreHorizontal className="size-4" />}
          />
        )}
      />
    </Section>
  );
}

function OverlaySection() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  return (
    <Section title="Overlays">
      <Row>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open sheet
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast({ title: `${TERMS.wave} saved`, tone: "success" })}
        >
          Success toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              title: "Upload failed",
              description: "The file did not finish uploading.",
              tone: "error",
              action: { label: "Try again", onClick: () => {} },
            })
          }
        >
          Error toast
        </Button>
      </Row>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={TERMS.requestDuet}
        description="Ask this creator to build on their Wave with you."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Send request</Button>
          </div>
        }
      >
        <Textarea
          id="kit-duet-message"
          label="Message"
          placeholder="Tell them what you have in mind"
          rows={4}
        />
      </Sheet>
    </Section>
  );
}

function StatesSection() {
  return (
    <Section title="Empty, error and loading states">
      <EmptyState
        title="Your feed is quiet"
        description="Follow a few creators and their Waves land here."
        icon={<Compass className="size-6" />}
        action={<Button size="sm">Go to {TERMS.explore}</Button>}
        secondaryAction={
          <Button size="sm" variant="ghost">
            {TERMS.create} {TERMS.aWave}
          </Button>
        }
      />
      <ErrorState onRetry={() => {}} />
      <WaveCardSkeleton />
    </Section>
  );
}

function AudioSection() {
  return (
    <Section title="Audio">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-subtle">Waveform, bars (static)</p>
        <Waveform peaks={DEMO_PEAKS} progress={0.42} duration={214} readOnly />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-subtle">Waveform, mirrored (static)</p>
        <Waveform peaks={DEMO_PEAKS_B} progress={0.7} duration={96} variant="mirror" readOnly />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-subtle">
          WavePlayer, default (silent demo asset)
        </p>
        <WavePlayer
          waveId="kit-player"
          src={SILENT_WAV}
          peaks={DEMO_PEAKS}
          duration={1}
          title="Gallery demo"
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-subtle">WavePlayer, compact</p>
        <WavePlayer
          waveId="kit-player-compact"
          src={SILENT_WAV}
          peaks={DEMO_PEAKS_B}
          duration={1}
          title="Gallery demo, compact"
          variant="compact"
        />
      </div>
    </Section>
  );
}

function WaveSection() {
  const { toast } = useToast();
  const notify = (label: string) => () => toast({ title: label });

  return (
    <Section title="Wave card">
      <WaveCard
        wave={DEMO_WAVE}
        onComment={notify(TERMS.comment)}
        onSave={notify(TERMS.save)}
        onShare={notify(TERMS.share)}
        onRequestDuet={notify(TERMS.requestDuet)}
      />
      <WaveCard wave={DEMO_DUET} onRequestDuet={notify(TERMS.requestDuet)} />
    </Section>
  );
}

const COLOR_TOKENS = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["surface-muted", "bg-surface-muted"],
  ["surface-inset", "bg-surface-inset"],
  ["border-strong", "bg-border-strong"],
  ["accent", "bg-accent"],
  ["accent-soft", "bg-accent-soft"],
  ["danger", "bg-danger"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["wave-track", "bg-wave-track"],
  ["wave-progress", "bg-wave-progress"],
];

const RADIUS_TOKENS = [
  ["xs", "rounded-xs"],
  ["sm", "rounded-sm"],
  ["md", "rounded-md"],
  ["lg", "rounded-lg"],
  ["xl", "rounded-xl"],
  ["2xl", "rounded-2xl"],
];

function TokensSection() {
  return (
    <Section title="Design tokens">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COLOR_TOKENS.map(([name, className]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <span
              className={cn("h-12 w-full rounded-md border border-border", className)}
              aria-hidden="true"
            />
            <span className="font-mono text-[0.6875rem] text-fg-subtle">{name}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {RADIUS_TOKENS.map(([name, className]) => (
          <div key={name} className="flex flex-col items-center gap-1.5">
            <span
              className={cn("size-14 border border-border-strong bg-surface-muted", className)}
              aria-hidden="true"
            />
            <span className="font-mono text-[0.6875rem] text-fg-subtle">{name}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FormattersSection() {
  const [now] = useState(() => Date.now());
  return (
    <Section title="Formatters">
      <ul className="space-y-1 font-mono text-xs text-fg-muted">
        <li>formatDuration(214) = {formatDuration(214)}</li>
        <li>formatDuration(3725) = {formatDuration(3725)}</li>
        <li>formatCount(999) = {formatCount(999)}</li>
        <li>formatCount(1234) = {formatCount(1234)}</li>
        <li>formatCount(1284000) = {formatCount(1284000)}</li>
        <li>timeAgo(-47 min) = {timeAgo(now - 1000 * 60 * 47, now)}</li>
        <li>timeAgo(-3 days) = {timeAgo(now - 1000 * 60 * 60 * 24 * 3, now)}</li>
      </ul>
    </Section>
  );
}
