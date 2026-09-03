"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/ui";

import { IconButton } from "./IconButton";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Rendered in a sticky footer, typically the confirm/cancel buttons. */
  footer?: ReactNode;
  /** Hide the title visually while keeping it as the accessible name. */
  hideTitle?: boolean;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A bottom sheet on mobile, a centred dialog from `sm` up (spec section 36).
 *
 * Implements the dialog pattern by hand rather than pulling in a dependency:
 * `role="dialog"` + `aria-modal`, Escape to close, focus moved in on open and
 * restored on close, Tab cycling contained inside the panel, and the page
 * behind it inert to scrolling.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  hideTitle = false,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay motion-safe:[animation:akinti-fade-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex max-h-[88dvh] w-full flex-col overflow-hidden bg-surface shadow-lg",
          "rounded-t-2xl sm:max-w-lg sm:rounded-2xl",
          "motion-safe:[animation:akinti-slide-up_180ms_ease-out]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className={cn("min-w-0", hideTitle && "sr-only")}>
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label="Close"
            icon={<X className="size-4" />}
            onClick={onClose}
            className="-mr-2 -mt-1"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="akinti-safe-bottom border-t border-border bg-surface px-5 py-3">
            {footer}
          </div>
        ) : (
          <div className="akinti-safe-bottom" />
        )}
      </div>
    </div>
  );
}
