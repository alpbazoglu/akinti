import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface VisuallyHiddenProps {
  children: ReactNode;
  /** Render as a different element, e.g. `span` inside a button. */
  as?: ElementType;
  className?: string;
}

/** Visible to screen readers, hidden from sight. */
export function VisuallyHidden({
  children,
  as: Component = "span",
  className,
}: VisuallyHiddenProps) {
  return (
    <Component
      className={cn(
        "absolute -m-px h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap",
        "[clip:rect(0,0,0,0)] [clip-path:inset(50%)]",
        className,
      )}
    >
      {children}
    </Component>
  );
}
