"use client";

import { useCallback, useId, useRef, useState, type DragEvent } from "react";

import { Waveform } from "@/components/audio";
import { Button } from "@/components/ui";
import { getDurationMs, validateFile } from "@/lib/audio";
import { MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_MS } from "@/lib/supabase/config";
import { cn } from "@/lib/ui";

export interface UploadDropzoneProps {
  /** Called once a file passes client-side validation (spec §18). */
  onFileAccepted: (file: File, durationMs: number) => void;
  /** Back to the record screen. */
  onRecord?: () => void;
  className?: string;
}

type Phase = "idle" | "reading" | "error";

const MAX_MEGABYTES = Math.round(MAX_AUDIO_BYTES / (1024 * 1024));
const MAX_MINUTES = Math.round(MAX_AUDIO_DURATION_MS / 60000);

/** The dormant trace draws ticks, not data (§6.2). */
const NO_PEAKS: readonly number[] = [];

/**
 * Upload a file you already have (spec §18).
 *
 * Not a dashed-border box in the middle of the screen: a rail item with a
 * dormant waterline where the audio will go, a hairline above it, and one key.
 * The dashed rectangle is the single most template-shaped element in this
 * category, and a drop target that draws the thing it is waiting for says the
 * same thing without it. Dropping still works anywhere on the row, because
 * that is free on a desktop and invisible on a phone.
 *
 * Validation messages are sentences about what to do, not error codes
 * (`mobile-guidelines.md` rule 38). This check is fast local feedback only —
 * the server independently re-validates size, duration and magic bytes before
 * accepting anything (`docs/AUDIO_ARCHITECTURE.md`).
 */
export function UploadDropzone({ onFileAccepted, onRecord, className }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const processFile = useCallback(
    async (file: File) => {
      setPhase("reading");
      setError(null);
      try {
        const durationMs = await getDurationMs(file).catch(() => null);
        const result = await validateFile(file, { durationMs: durationMs ?? undefined });
        if (!result.ok) {
          setPhase("error");
          setError(result.reason ?? "This file can't be used.");
          return;
        }
        setPhase("idle");
        onFileAccepted(file, durationMs ?? 0);
      } catch {
        setPhase("error");
        setError("This file could not be read. Try a different one.");
      }
    },
    [onFileAccepted],
  );

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void processFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div className="-mx-page akinti-edge-fade">
        <Waveform peaks={NO_PEAKS} state="dormant" height={96} readOnly label="No file chosen yet" />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col gap-3 border-t py-4 transition-colors duration-[--dur-micro]",
          dragOver ? "border-ink" : "border-hairline",
        )}
      >
        <p className="type-body measure text-ink">
          {dragOver ? "Drop it here." : "Choose an audio file, or drop one on this page."}
        </p>
        <p className="type-caption text-ink-subtle">
          MP3, WAV, OGG, FLAC, M4A or WebM · up to {MAX_MEGABYTES} MB and {MAX_MINUTES} minutes
        </p>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <Button
            size="lg"
            loading={phase === "reading"}
            loadingLabel="Checking the file"
            onClick={() => inputRef.current?.click()}
          >
            Choose a file
          </Button>
          {onRecord ? (
            <Button variant="ghost" onClick={onRecord}>
              Record instead
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="audio/*"
          aria-label="Choose an audio file to upload"
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {error ? (
          <p role="alert" className="type-body-sm measure text-signal-deep">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
