"use client";

import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface TabItem {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly count?: number;
  readonly disabled?: boolean;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Names the tablist for screen readers. */
  label: string;
  /** `underline` for page-level tabs, `segmented` for compact switches. */
  variant?: "underline" | "segmented";
  /** Supply a stable prefix when you render matching <TabPanel>s. */
  idPrefix?: string;
  className?: string;
}

/**
 * WAI-ARIA tabs with manual activation: arrows move focus and select,
 * Home/End jump to the ends. Panels are rendered by the caller and should
 * reference `tabPanelId(baseId, value)`.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  label,
  variant = "underline",
  idPrefix,
  className,
}: TabsProps) {
  const generatedId = useId();
  const baseId = idPrefix ?? generatedId;
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = useCallback((index: number) => {
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs?.item(index)?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;

    const currentIndex = enabled.findIndex((item) => item.value === value);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % enabled.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = enabled.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = enabled[nextIndex];
    if (!next) return;
    onValueChange(next.value);
    focusTab(items.findIndex((item) => item.value === next.value));
  };

  const isSegmented = variant === "segmented";

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex items-center overflow-x-auto",
        isSegmented
          ? "gap-1 rounded-full bg-surface-muted p-1"
          : "gap-1 border-b border-border",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={tabId(baseId, item.value)}
            aria-selected={selected}
            aria-controls={tabPanelId(baseId, item.value)}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap",
              "transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "disabled:cursor-not-allowed disabled:opacity-55",
              isSegmented
                ? cn(
                    "h-8 rounded-full px-3.5",
                    selected
                      ? "bg-surface text-fg shadow-xs"
                      : "text-fg-muted hover:text-fg",
                  )
                : cn(
                    "h-10 rounded-t-sm border-b-2 px-3.5",
                    selected
                      ? "border-accent text-fg"
                      : "border-transparent text-fg-muted hover:text-fg",
                  ),
            )}
          >
            {item.icon ? (
              <span aria-hidden="true" className="inline-flex">
                {item.icon}
              </span>
            ) : null}
            {item.label}
            {typeof item.count === "number" ? (
              <span className="text-fg-subtle tabular-nums">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function tabId(baseId: string, value: string): string {
  return `${baseId}-tab-${value}`;
}

export function tabPanelId(baseId: string, value: string): string {
  return `${baseId}-panel-${value}`;
}

export interface TabPanelProps {
  /** Must match the `id` generated for the corresponding tab. */
  id: string;
  labelledBy: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, labelledBy, active, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      hidden={!active}
      tabIndex={0}
      className={cn("focus-visible:outline-2 focus-visible:outline-ring", className)}
    >
      {active ? children : null}
    </div>
  );
}
