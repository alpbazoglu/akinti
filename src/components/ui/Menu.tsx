"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/ui";

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Renders in the danger tone, e.g. Delete or Report. */
  readonly destructive?: boolean;
}

export interface MenuProps {
  /** The control that opens the menu. Cloned with the needed ARIA wiring. */
  trigger: (props: MenuTriggerProps) => ReactNode;
  items: readonly MenuItem[];
  /** Names the menu for screen readers. */
  label: string;
  align?: "start" | "end";
  className?: string;
}

export interface MenuTriggerProps {
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * A dropdown menu following the WAI-ARIA menu button pattern: arrows move
 * between items, Home/End jump, Escape closes and returns focus to the trigger,
 * and an outside click dismisses it.
 */
export function Menu({ trigger, items, label, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const menuId = `${baseId}-menu`;

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) {
      const focusable = wrapperRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || wrapperRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  // Re-clicking the trigger while open just closes the menu; the browser has
  // already focused the clicked button, so this intentionally skips the
  // ref-based focus restoration that `close()` performs for keyboard/selection
  // paths (calling `close()` here would tie a ref read to the render-prop
  // callback handed to `trigger`).
  const handleTriggerClick = () => {
    if (open) {
      setOpen(false);
    } else {
      openAt(enabledIndexes[0] ?? 0);
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt(enabledIndexes[0] ?? 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(enabledIndexes[enabledIndexes.length - 1] ?? 0);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
      return;
    }

    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(activeIndex);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex(enabledIndexes[(position + 1) % enabledIndexes.length]);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex(
          enabledIndexes[(position - 1 + enabledIndexes.length) % enabledIndexes.length],
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(enabledIndexes[0]);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1]);
        break;
      default:
        break;
    }
  };

  const triggerProps: MenuTriggerProps = {
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": menuId,
    onClick: handleTriggerClick,
    onKeyDown: handleTriggerKeyDown,
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <span ref={wrapperRef} className="contents">
        {trigger(triggerProps)}
      </span>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          aria-labelledby={triggerId}
          onKeyDown={handleMenuKeyDown}
          className={cn(
            "absolute top-[calc(100%+0.375rem)] z-40 min-w-52 overflow-hidden rounded-lg",
            "border border-border bg-surface-raised py-1 shadow-md",
            "motion-safe:[animation:akinti-fade-in_120ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                close();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                "transition-colors duration-100 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-55",
                item.destructive ? "text-danger" : "text-fg",
                "hover:bg-surface-muted focus:bg-surface-muted",
              )}
            >
              {item.icon ? (
                <span aria-hidden="true" className="inline-flex text-fg-subtle">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
