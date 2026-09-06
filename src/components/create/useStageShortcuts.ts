"use client";

import { useEffect } from "react";

/**
 * The Create flow's keyboard shortcuts (`DESIGN_V3_DESKTOP.md`: "Keyboard
 * shortcuts: space = arm/stop, R = retake, Enter = continue (shown as
 * hints)"). One small hook shared by `RecordStage`/`ReviewStage`/
 * `EnhanceStage` rather than three copies of the same guard logic — each
 * passes only the handlers that make sense for its own step (`RecordStage`
 * has no "continue", `EnhanceStage` has no "retake").
 *
 * Never fires while the reader is typing (a text field, a textarea, the
 * title/description form on the Details step) or while focus already sits on
 * a button/link that the same key would natively activate — a global Space
 * listener double-firing a focused button's own `onClick` would otherwise
 * arm/stop twice, or insert nothing but still swallow a text field's space
 * bar.
 */
export interface StageShortcuts {
  /** "space = arm/stop" — bound to the recorder's own local state, not lifted to `CreateFlow`. */
  onSpace?: () => void;
  /** "R = retake" */
  onRetake?: () => void;
  /** "Enter = continue" */
  onContinue?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

function isNativelyActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, [role="button"]') !== null;
}

export function useStageShortcuts({ onSpace, onRetake, onContinue }: StageShortcuts): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === " " && onSpace) {
        if (isNativelyActivatable(event.target)) return;
        event.preventDefault();
        onSpace();
        return;
      }

      if ((event.key === "r" || event.key === "R") && onRetake) {
        onRetake();
        return;
      }

      if (event.key === "Enter" && onContinue) {
        if (isNativelyActivatable(event.target)) return;
        onContinue();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSpace, onRetake, onContinue]);
}
