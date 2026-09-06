"use client";

/**
 * The top route-progress line (`docs/design/DESIGN_V3_DESKTOP.md`
 * "Feedback": "2px top progress line in current teal within 50ms"), answering
 * `docs/research/desktop/FEEDBACK_AUDIT.md`'s headline finding: a client nav
 * click painted nothing different for 700-1200ms because nothing in the
 * product watched for a pending navigation at all.
 *
 * App Router has no public "navigation started" event to subscribe to, so
 * this listens for the same signal a human click actually produces: a
 * capture-phase `click` on an in-app `<a>` whose `href` differs from the
 * current URL. That handler runs synchronously inside the click, so the bar
 * appears within the same frame — nowhere near the 50ms budget — and
 * `usePathname()` clears it once the new route has actually taken over.  A
 * safety timeout clears a stuck bar (an external link, a `target="_blank"`,
 * or a navigation the router itself cancels).
 *
 * Desktop-only (`lg:` — >= 1024px) per this pass's scope; `AppShell` mounts
 * it unconditionally and the class below hides it at every narrower width so
 * mobile's current behaviour is untouched.
 */

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/ui";

const STUCK_TIMEOUT_MS = 8000;
const DONE_LINGER_MS = 200;

function isSameOriginNavigationLink(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.origin !== window.location.origin) return false;
  const nextUrl = `${anchor.pathname}${anchor.search}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  return nextUrl !== currentUrl;
}

export function RouteProgress() {
  const pathname = usePathname();
  const tLayout = useTranslations("Layout");
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || !isSameOriginNavigationLink(anchor)) return;

      setPhase("loading");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setPhase("idle"), STUCK_TIMEOUT_MS);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  useEffect(() => {
    if (pathname === previousPathnameRef.current) return;
    previousPathnameRef.current = pathname;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPhase("done");
    const linger = setTimeout(() => setPhase("idle"), DONE_LINGER_MS);
    return () => clearTimeout(linger);
  }, [pathname]);

  if (phase === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 hidden h-0.5 overflow-hidden bg-transparent lg:block"
    >
      <span className="sr-only">{tLayout("routeLoading")}</span>
      <div
        aria-hidden="true"
        className={cn(
          "h-full bg-tide transition-[width,opacity] ease-[--ease-enter]",
          phase === "loading" && "w-3/5 duration-[4000ms]",
          phase === "done" && "w-full duration-150 opacity-0",
        )}
      />
    </div>
  );
}
