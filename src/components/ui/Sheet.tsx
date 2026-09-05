"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Drawer } from "vaul";

import { cn } from "@/lib/ui";

import { IconButton } from "./IconButton";
import { X } from "./icons";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Rendered in a sticky footer, typically the confirm/cancel keys. */
  footer?: ReactNode;
  /** Hide the title visually while keeping it as the accessible name. */
  hideTitle?: boolean;
  className?: string;
}

/**
 * The bottom sheet (§8.6).
 *
 * 24px top corners, `paper-raised` fill, level-1 elevation, a 42% ink scrim
 * and the 380ms spring from §7.1. Dismissible by drag, by scrim tap and by
 * Escape. A centred dialog is used only to confirm something irreversible, so
 * this is a sheet at every breakpoint rather than a dialog above `sm`.
 *
 * Built on `vaul` (`docs/research/libraries.md` §5) so the drag physics, the
 * focus trap, the scroll lock and the inert background come from Radix Dialog
 * rather than from hand-rolled keyboard handling.
 *
 * The grabber is a 24px waterline, not a grey capsule.
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
  // Every real caller opens this from a plain button, not `Drawer.Trigger` —
  // the open/close state is controlled entirely from outside. Radix's own
  // close-focus default only ever refocuses a registered `Trigger`'s ref,
  // which is `null` here, so it silently drops focus to the scrim/body
  // instead of the button that opened the sheet. Capturing whatever was
  // focused right before open and restoring it ourselves on close (below)
  // is what actually returns focus to the trigger element.
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
  }, [open]);

  return (
    <Drawer.Root
      open={open}
      // Radix's Dialog (which `Drawer.Content` is) already provides the
      // focus trap, `aria-modal`, body-scroll lock and Escape-to-close for
      // free — but vaul defaults `autoFocus` to `false` so a form input
      // inside the sheet doesn't pop the mobile keyboard on open. That also
      // meant focus was never moved into the sheet at all: `Tab` landed on
      // whatever was focused behind the scrim, and once focus had drifted
      // outside the dialog's scope, `Escape` stopped reaching it too. Opting
      // back into `autoFocus` restores Radix's default open/close focus
      // handling (first focusable descendant, or the panel itself via its
      // `tabIndex=-1`, per `FocusScope`) without any hand-rolled trap.
      autoFocus
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="akinti-scrim fixed inset-0 z-50" />
        <Drawer.Content
          // Radix warns when a dialog carries an `aria-describedby` pointing at
          // a `Description` that was never rendered. When this sheet has no
          // description, explicitly clearing the attribute is Radix's own
          // escape hatch; when it does, the context wiring is left alone.
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col outline-none",
            "rounded-t-sheet bg-paper-raised shadow-sheet",
            "mx-auto w-full sm:max-w-lg",
            className,
          )}
        >
          {/* The grabber is a waterline: a 24px trace, not a capsule (§8.6). */}
          <div className="flex justify-center pt-3 pb-1">
            <span aria-hidden="true" className="flex h-2 w-6 items-end gap-px">
              <span className="h-1 flex-1 bg-hairline-strong" />
              <span className="h-2 flex-1 bg-hairline-strong" />
              <span className="h-1.5 flex-1 bg-hairline-strong" />
              <span className="h-2 flex-1 bg-hairline-strong" />
              <span className="h-1 flex-1 bg-hairline-strong" />
              <span className="h-1.5 flex-1 bg-hairline-strong" />
            </span>
          </div>

          <div className="akinti-page flex items-start justify-between gap-5 pt-2 pb-4">
            <div className={cn("min-w-0", hideTitle && "sr-only")}>
              <Drawer.Title className="type-heading text-ink">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="type-body-sm measure mt-1 text-ink-muted">
                  {description}
                </Drawer.Description>
              ) : null}
            </div>
            <Drawer.Close asChild>
              <IconButton
                label="Close"
                icon={<X className="size-5" />}
                className="-mt-1 -mr-2"
              />
            </Drawer.Close>
          </div>

          <div className="akinti-page min-h-0 flex-1 overflow-y-auto pb-5">{children}</div>

          {footer ? (
            <div className="akinti-page akinti-safe-bottom border-t border-hairline pt-4 pb-4">
              {footer}
            </div>
          ) : (
            <div className="akinti-safe-bottom" />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
