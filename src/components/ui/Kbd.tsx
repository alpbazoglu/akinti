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
        "type-mono-sm inline-flex h-5 min-w-5 items-center justify-center rounded-label",
        "border border-hairline-strong px-1.5 text-ink-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
