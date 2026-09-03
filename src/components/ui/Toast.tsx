"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

import { cn } from "@/lib/ui";

import { IconButton } from "./IconButton";

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

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 5000;

const TONE_ICONS: Record<ToastTone, ReactNode> = {
  info: <Info className="size-4 text-accent" />,
  success: <CircleCheck className="size-4 text-success" />,
  error: <CircleAlert className="size-4 text-danger" />,
};

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const duration = options.duration ?? DEFAULT_DURATION;

      setToasts((current) => [...current, { ...options, id }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return api;
}

interface ToastViewportProps {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-60 flex flex-col items-center gap-2 px-4",
        "bottom-[calc(var(--akinti-bottom-nav-h)+1rem)] sm:bottom-6 sm:items-end sm:px-6",
      )}
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border",
            "bg-surface-raised px-4 py-3 shadow-md",
            "motion-safe:[animation:akinti-slide-up_180ms_ease-out]",
          )}
        >
          <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0">
            {TONE_ICONS[item.tone ?? "info"]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{item.title}</p>
            {item.description ? (
              <p className="mt-0.5 text-sm text-fg-muted">{item.description}</p>
            ) : null}
            {item.action ? (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  onDismiss(item.id);
                }}
                className={cn(
                  "mt-1.5 text-sm font-medium text-accent underline underline-offset-2",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
          <IconButton
            label="Dismiss"
            size="sm"
            icon={<X className="size-3.5" />}
            onClick={() => onDismiss(item.id)}
            className="-mr-1.5 -mt-1"
          />
        </div>
      ))}
    </div>
  );
}
