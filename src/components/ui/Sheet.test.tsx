import { useState } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { Sheet } from "./Sheet";

// vaul (`Drawer.Root`) checks `display-mode: standalone` via `matchMedia` the
// moment it opens, to skip a Safari toolbar workaround in PWA mode. jsdom has
// no `matchMedia` implementation at all, so opening a real `Sheet` under
// vitest needs this minimal stand-in — scoped to this file rather than the
// shared test setup, since nothing else here exercises vaul.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

/** A trigger button plus a controlled `Sheet`, the shape every real caller uses. */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Test sheet">
        <p>Sheet content</p>
      </Sheet>
    </div>
  );
}

describe("Sheet", () => {
  it("returns focus to the trigger after Escape closes it", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open sheet" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Test sheet" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the trigger after the close button closes it", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open sheet" });

    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole("dialog", { name: "Test sheet" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
