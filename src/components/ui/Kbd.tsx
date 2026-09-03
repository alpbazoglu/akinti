import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** A keyboard key, used in shortcut hints and accessibility help text. */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border-strong",
        "bg-surface-muted px-1.5 font-mono text-[0.6875rem] leading-none text-fg-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
