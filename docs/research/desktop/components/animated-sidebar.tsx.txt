// Source: https://21st.dev/@unlumen/components/sidebar-001
// Author: unlumen
// Licence: 21st.dev component (fetched via mcp__21st__get_component, id 21517).
// Distributed via the shadcn CLI registry; treat as MIT-style, attribute the
// author, verify before shipping. Retrieved 2026-09-06 for research only.
//
// Why this one: the piece worth stealing is the *mechanism*, not the look --
// a spring-animated hover highlight that measures the hovered row's
// getBoundingClientRect() and animates a single shared background rect to
// it (motion `layoutId`), plus an animated active-indicator bar, plus a
// resizable rail via pointer capture. AKINTI's sidebar is fixed-width
// (72px/200px per DESIGN.md §8.1, no drag-resize) and must not gain a
// filled hover pill (no-pill rule), but the *spring physics* for the active
// indicator bar and the collapsible group disclosure animation are exactly
// the kind of "clicks feel dead" fix the founder is asking for: real
// stiffness/damping values (300-800/30-40), not a linear 150ms ease.

"use client";

import * as React from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MotionChevron = motion.create(ChevronRight);

const EFFECTS_KEY = "sidebar-001-effects";

const EffectsContext = createContext<{ enabled: boolean; toggle: () => void }>({
  enabled: true,
  toggle: () => {},
});

function EffectsProvider({
  children,
  defaultEnabled = true,
}: {
  children: React.ReactNode;
  defaultEnabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return defaultEnabled;
    const stored = localStorage.getItem(EFFECTS_KEY);
    return stored !== null ? stored === "true" : defaultEnabled;
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(EFFECTS_KEY, String(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({ enabled, toggle }), [enabled, toggle]);
  return (
    <EffectsContext.Provider value={value}>{children}</EffectsContext.Provider>
  );
}

export function useSidebar001Effects() {
  return useContext(EffectsContext);
}

// --- Hover context ----------------------------------------------------------

interface HoverRect {
  top: number;
  height: number;
  left: number;
}

const HoverContext = createContext<{
  hovered: string | null;
  hoverRect: HoverRect | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setHovered: (id: string | null, rect?: HoverRect | null) => void;
}>({
  hovered: null,
  hoverRect: null,
  containerRef: { current: null },
  setHovered: () => {},
});

function HoverProvider({
  children,
  containerRef,
}: {
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHoveredId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<HoverRect | null>(null);

  const setHovered = useCallback(
    (id: string | null, rect?: HoverRect | null) => {
      setHoveredId(id);
      setHoverRect(rect ?? null);
    },
    [],
  );

  const value = useMemo(
    () => ({ hovered, hoverRect, containerRef, setHovered }),
    [hovered, hoverRect, containerRef, setHovered],
  );

  return (
    <HoverContext.Provider value={value}>{children}</HoverContext.Provider>
  );
}

// --- Scroll to active --------------------------------------------------------

function useScrollToActive(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (!active || scrolled.current || !ref.current) return;
    scrolled.current = true;
    const el = ref.current;
    const schedule =
      typeof requestIdleCallback !== "undefined"
        ? (cb: () => void) => requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 100);
    const cancel =
      typeof cancelIdleCallback !== "undefined"
        ? cancelIdleCallback
        : clearTimeout;
    const id = schedule(() => {
      const viewport = el.closest("[data-scroll-viewport]");
      if (!(viewport instanceof HTMLElement)) return;
      const vpRect = viewport.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset =
        elRect.top - vpRect.top - vpRect.height / 2 + elRect.height / 2;
      if (Math.abs(offset) > 40)
        viewport.scrollBy({ top: offset, behavior: "smooth" });
    });
    return () => cancel(id as number);
  }, [active]);

  useEffect(() => {
    if (!active) scrolled.current = false;
  }, [active]);

  return ref;
}

// --- HoverHighlight ------------------------------------------------------------

function HoverHighlight() {
  const { hoverRect, hovered } = useContext(HoverContext);
  const { enabled } = useContext(EffectsContext);

  return (
    <AnimatePresence>
      {enabled && hovered && hoverRect && (
        <motion.div
          key="sb001-hover-bg"
          className="pointer-events-none absolute z-0 rounded-md bg-accent/50"
          style={{ right: 0 }}
          initial={false}
          animate={{
            top: hoverRect.top + 2,
            height: hoverRect.height - 4,
            left: hoverRect.left,
            opacity: 1,
          }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </AnimatePresence>
  );
}

// --- Sidebar001Item ------------------------------------------------------------

export interface Sidebar001ItemProps {
  href: string;
  label: React.ReactNode;
  isActive: boolean;
  isNew?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

export const Sidebar001Item = memo(function Sidebar001Item({
  href,
  label,
  isActive,
  isNew,
  className,
  onClick,
}: Sidebar001ItemProps) {
  const { hovered, setHovered, containerRef } = useContext(HoverContext);
  const isHovered = hovered === href;
  const itemRef = useScrollToActive(isActive);

  const opacity = isActive
    ? 1
    : hovered !== null
      ? isHovered
        ? 1
        : 0.3
      : 0.55;
  const x = isActive ? 8 : isHovered ? 6 : 0;

  return (
    <div className="relative">
      {isActive && (
        <motion.span
          layoutId="sb001-active-bar"
          className="pointer-events-none absolute z-10 left-[4px] top-1/2 h-[1.8px] -translate-y-1/2 rounded-full bg-accent-pro"
          animate={{ width: 23 }}
          transition={{ type: "spring", stiffness: 800, damping: 40 }}
        />
      )}

      <motion.span
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-px bg-foreground/50"
        animate={{ width: isActive ? 0 : isHovered ? 26 : 18 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
      />
      <motion.span className="pointer-events-none absolute w-[13px] left-0 top-1/4 h-px bg-foreground/30" />
      <motion.span className="pointer-events-none absolute w-[16px] left-0 top-0 h-px bg-foreground/30" />
      <motion.span className="pointer-events-none absolute w-[13px] left-0 top-3/4 h-px bg-foreground/30" />

      <motion.div
        ref={itemRef}
        animate={{ opacity, x }}
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
        style={{ transformOrigin: "left center" }}
      >
        <a
          href={href}
          onClick={onClick}
          onMouseEnter={() => {
            const el = itemRef.current;
            const container = containerRef.current;
            if (el && container) {
              const elRect = el.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              setHovered(href, {
                top: elRect.top - containerRect.top,
                height: elRect.height,
                left: 25,
              });
            } else {
              setHovered(href);
            }
          }}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "relative flex items-center gap-2 ml-2 pl-4 py-1.5 text-sm select-none",
            className,
          )}
        >
          <span className="relative z-1 truncate">{label}</span>
          {isNew && (
            <span className="size-1.5 rounded-full bg-accent-pro shrink-0" />
          )}
        </a>
      </motion.div>
    </div>
  );
});

// --- Sidebar001Separator / Group / Section / Content / Sidebar001 --------------
// (unchanged from source; see 21st.dev URL above for the remainder, elided
// here only because it repeats the same spring-physics pattern shown above:
// Sidebar001Group uses the same AnimatePresence height:auto disclosure with
// stiffness 420 / damping 34, matching AKINTI's own bottom-sheet spring in
// DESIGN.md §7.1 almost exactly -- confirms that spring family is the right
// register for this product, not just for sheets but for any disclosure.)

export function Sidebar001Separator({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-0 py-3.5 mt-2 text-sm font-medium text-foreground/40",
        className,
      )}
    >
      {children}
    </div>
  );
}
