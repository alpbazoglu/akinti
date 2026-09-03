"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";

import { updateAppearance } from "@/app/(app)/settings/actions";
import { useCurrentUser } from "@/lib/auth";
import type {
  ThemeAccent,
  ThemeBackgroundColor,
  ThemeBackgroundGradient,
  ThemeBackgroundPattern,
} from "@/types/domain";
import { Avatar, Button, useToast } from "@/components/ui";
import {
  ACCENT_PRESETS,
  BACKGROUND_PRESETS,
  GRADIENT_PRESETS,
  PATTERN_PRESETS,
  cn,
  resolveProfileTheme,
} from "@/lib/ui";

export interface AppearanceFormProps {
  initialBgColor: ThemeBackgroundColor;
  initialBgGradient: ThemeBackgroundGradient;
  initialBgPattern: ThemeBackgroundPattern;
  initialAccent: ThemeAccent;
  name: string;
  avatarUrl: string | null;
}

/**
 * Settings → Appearance (spec §21/§25): background color, gradient, pattern
 * and accent — a curated set of presets only, never an open color field.
 * Every combination is AA-contrast-safe by construction
 * (`resolveProfileTheme`, `src/lib/ui/profileTheme.ts`), so there is no
 * "unreadable" pairing to guard against here.
 */
export function AppearanceForm({
  initialBgColor,
  initialBgGradient,
  initialBgPattern,
  initialAccent,
  name,
  avatarUrl,
}: AppearanceFormProps) {
  const { refreshProfile } = useCurrentUser();
  const { toast } = useToast();
  const [bgColor, setBgColor] = useState(initialBgColor);
  const [bgGradient, setBgGradient] = useState(initialBgGradient);
  const [bgPattern, setBgPattern] = useState(initialBgPattern);
  const [accent, setAccent] = useState(initialAccent);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resolved = useMemo(
    () =>
      resolveProfileTheme({
        backgroundColor: bgColor,
        backgroundGradient: bgGradient,
        backgroundPattern: bgPattern,
        accent,
      }),
    [bgColor, bgGradient, bgPattern, accent],
  );

  const dirty =
    bgColor !== initialBgColor ||
    bgGradient !== initialBgGradient ||
    bgPattern !== initialBgPattern ||
    accent !== initialAccent;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateAppearance({
        bgColor,
        bgGradient,
        bgPattern,
        accentColor: accent,
      });
      if (!result.ok) {
        setError(result.formError ?? "Could not save your appearance settings.");
        return;
      }
      await refreshProfile();
      toast({ title: result.message ?? "Saved.", tone: "success" });
    });
  }

  const bannerLayers = [resolved.gradient.css, resolved.pattern.backgroundImage].filter(
    (layer): layer is string => layer !== null,
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          aria-hidden="true"
          style={{
            backgroundColor: resolved.background.hex,
            backgroundImage: bannerLayers.length > 0 ? bannerLayers.join(", ") : undefined,
            backgroundSize: resolved.pattern.backgroundSize ?? undefined,
          }}
          className="h-24"
        />
        <div className="flex items-center gap-3 px-4 pt-0 pb-4">
          <Avatar name={name} src={avatarUrl} size="lg" className="-mt-8 ring-4 ring-surface" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{name}</p>
            <span
              className="mt-1 inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium"
              style={{ backgroundColor: resolved.accent.hex, color: resolved.accentForeground }}
            >
              Preview
            </span>
          </div>
        </div>
      </section>

      <PresetSection
        label="Background"
        presets={Object.values(BACKGROUND_PRESETS)}
        value={bgColor}
        onChange={(value) => setBgColor(value as ThemeBackgroundColor)}
        swatch={(hex) => ({ backgroundColor: hex })}
      />

      <PresetSection
        label="Gradient"
        presets={Object.values(GRADIENT_PRESETS).map((p) => ({ id: p.id, label: p.label, hex: "" }))}
        value={bgGradient}
        onChange={(value) => setBgGradient(value as ThemeBackgroundGradient)}
        swatch={(_hex, id) => {
          const preset = GRADIENT_PRESETS[id as ThemeBackgroundGradient];
          return {
            backgroundColor: resolved.background.hex,
            backgroundImage: preset.css ?? undefined,
          };
        }}
      />

      <PresetSection
        label="Pattern"
        presets={Object.values(PATTERN_PRESETS).map((p) => ({ id: p.id, label: p.label, hex: "" }))}
        value={bgPattern}
        onChange={(value) => setBgPattern(value as ThemeBackgroundPattern)}
        swatch={(_hex, id) => {
          const preset = PATTERN_PRESETS[id as ThemeBackgroundPattern];
          return {
            backgroundColor: resolved.background.hex,
            backgroundImage: preset.backgroundImage ?? undefined,
            backgroundSize: preset.backgroundSize ?? undefined,
          };
        }}
      />

      <PresetSection
        label="Accent"
        presets={Object.values(ACCENT_PRESETS)}
        value={accent}
        onChange={(value) => setAccent(value as ThemeAccent)}
        swatch={(hex) => ({ backgroundColor: hex })}
      />

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        onClick={handleSave}
        loading={isPending}
        disabled={!dirty && !isPending}
        className="self-start"
      >
        Save appearance
      </Button>
    </div>
  );
}

interface PresetOption {
  id: string;
  label: string;
  hex: string;
}

interface PresetSectionProps {
  label: string;
  presets: readonly PresetOption[];
  value: string;
  onChange: (value: string) => void;
  swatch: (hex: string, id: string) => CSSProperties;
}

function PresetSection({ label, presets, value, onChange, swatch }: PresetSectionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-fg">{label}</h2>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-3">
        {presets.map((preset) => {
          const selected = preset.id === value;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              onClick={() => onChange(preset.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <span
                aria-hidden="true"
                style={swatch(preset.hex, preset.id)}
                className={cn(
                  "size-9 rounded-full border-2",
                  selected ? "border-accent" : "border-border-strong",
                )}
              />
              <span className="text-[0.6875rem] text-fg-subtle">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
