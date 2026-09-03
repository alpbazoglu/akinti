"use client";

import { useCallback, useId, useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

import { getDurationMs, validateFile } from "@/lib/audio";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/ui";

export interface UploadDropzoneProps {
  /** Called once a file passes client-side validation (spec §18). */
  onFileAccepted: (file: File, durationMs: number) => void;
  className?: string;
}

type Phase = "idle" | "validating" | "error";

/**
 * Drag-and-drop / click-to-browse file picker for uploaded Waves (spec §18).
 * Validates format, size and duration client-side via `validateFile` before
 * ever calling `onFileAccepted` — the server re-validates independently, this
 * is purely fast feedback (see the JSDoc on `validateFile`).
 */
export function UploadDropzone({ onFileAccepted, className }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const processFile = useCallback(
    async (file: File) => {
      setPhase("validating");
      setError(null);
      try {
        const durationMs = await getDurationMs(file).catch(() => null);
        const result = await validateFile(file, { durationMs: durationMs ?? undefined });
        if (!result.ok) {
          setPhase("error");
          setError(result.reason ?? "This file could not be used.");
          return;
        }
        setPhase("idle");
        onFileAccepted(file, durationMs ?? 0);
      } catch {
        setPhase("error");
        setError("This file could not be read. Try a different file.");
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
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center",
          "cursor-pointer transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          dragOver ? "border-accent bg-accent-soft" : "border-border-strong hover:border-fg-subtle",
        )}
      >
        {phase === "validating" ? (
          <Spinner label="Checking file" />
        ) : (
          <>
            <Upload className="size-6 text-fg-subtle" aria-hidden="true" />
            <p className="text-sm font-medium text-fg">
              Drop an audio file here, or click to choose one
            </p>
            <p id={hintId} className="text-xs text-fg-subtle">
              MP3, WAV, OGG, FLAC, M4A or WebM
            </p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="audio/*"
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
