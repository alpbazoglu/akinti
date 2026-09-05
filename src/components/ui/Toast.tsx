"use client";

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { Toaster, toast as sonnerToast } from "sonner";

import { cn } from "@/lib/ui";

export type ToastTone = "info" | "success" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. `0` keeps it until dismissed. */
  duration?: number;
  action?: {
    readonly label: string;
    readonly onClick: () => void;
  };
}

export interface Toast extends ToastOptions {
  readonly id: string;
}

export interface ToastApi {
  /** Show a toast. Returns its id so it can be dismissed early. */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export interface ToastProviderProps {
  children: ReactNode;
}

/** Auto-dismiss at 4s, or persist if it carries an action (§8.13). */
const DEFAULT_DURATION = 4000;
const PERSIST = Number.POSITIVE_INFINITY;

interface ToastStripProps extends ToastOptions {
  id: string;
}

/**
 * A single 44px ink strip pinned above the keyboard (§8.13).
 *
 * One line of text, at most one action, no icon, no progress bar, no
 * celebration. The verb matches the action exactly: Publish produces
 * "Published.", Save produces "Saved."
 *
 * `tone` survives as an accessibility signal rather than a colour one — an
 * error is announced assertively. Nothing here is tinted: the strip is ink in
 * both themes, because a coloured toast would be an accent outside audio state
 * (§4.4, §12.3).
 */
function ToastStrip({ id, title, description, tone, action }: ToastStripProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex min-h-11 w-full items-center gap-4 rounded-key bg-ink px-4 py-2.5",
        "type-body-sm text-on-ink",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate">{title}</p>
        {description ? (
          <p className="type-caption mt-0.5 truncate text-on-ink opacity-70">{description}</p>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            sonnerToast.dismiss(id);
          }}
          className={cn(
            "type-subhead shrink-0 text-on-ink underline decoration-1 underline-offset-[3px]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper",
          )}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

/** Clears the keyboard and the home indicator (`mobile-guidelines.md` rule 51). */
const TOAST_OFFSET =
  "calc(var(--akinti-keyboard-h) + env(safe-area-inset-bottom, 0px) + 16px)";

/**
 * Mounts the toast viewport once at the root.
 *
 * `sonner` (`docs/research/libraries.md` §5) supplies the queue, the timers,
 * the swipe-to-dismiss and the `aria-live` region; every pixel of the strip
 * itself is ours, through `toast.custom` and `unstyled`, so sonner's own card
 * with its icon and border never renders.
 *
 * One toast is visible at a time. A stack of toasts is a queue the reader did
 * not ask for.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-center"
        visibleToasts={1}
        gap={0}
        offset={TOAST_OFFSET}
        mobileOffset={TOAST_OFFSET}
        toastOptions={{ unstyled: true, classNames: { toast: "w-full" } }}
        className="w-full max-w-[calc(100%-2.5rem)] sm:max-w-sm"
      />
    </>
  );
}

/**
 * The toast API. Deliberately the same shape it had before the swap to
 * `sonner`, so every call site keeps reading `const { toast } = useToast()`.
 */
export function useToast(): ToastApi {
  const counter = useRef(0);

  const toast = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const id = `toast-${counter.current}-${Date.now()}`;
    const requested = options.duration ?? (options.action ? PERSIST : DEFAULT_DURATION);

    sonnerToast.custom(() => <ToastStrip {...options} id={id} />, {
      id,
      duration: requested === 0 ? PERSIST : requested,
    });

    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    sonnerToast.dismiss(id);
  }, []);

  return useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);
}
