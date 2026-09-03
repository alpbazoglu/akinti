import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Waveform, placeholderPeaks } from "./Waveform";

const PEAKS = placeholderPeaks(20, 3);

function renderSeekable(progress = 0.5, onSeek = vi.fn()) {
  render(
    <Waveform peaks={PEAKS} progress={progress} duration={200} onSeek={onSeek} label="Seek" />,
  );
  return { slider: screen.getByRole("slider", { name: "Seek" }), onSeek };
}

describe("Waveform", () => {
  it("exposes an operable slider with the playback position", () => {
    const { slider } = renderSeekable(0.25);

    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAttribute("aria-valuenow", "25");
    expect(slider).toHaveAttribute("aria-valuetext", "0:50 of 3:20");
    expect(slider).toHaveAttribute("tabindex", "0");
  });

  it("is a picture, not a control, when no seek handler is given", () => {
    render(<Waveform peaks={PEAKS} progress={0.5} duration={200} label="Waveform" />);

    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("img", { name: "Waveform" })).not.toHaveAttribute("tabindex");
  });

  it("seeks forward and backward with the arrow keys", () => {
    const { slider, onSeek } = renderSeekable(0.5);

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(0.51);

    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(0.49);

    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onSeek).toHaveBeenLastCalledWith(0.51);

    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(onSeek).toHaveBeenLastCalledWith(0.49);
  });

  it("seeks in larger steps with Page Up and Page Down", () => {
    const { slider, onSeek } = renderSeekable(0.5);

    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(onSeek).toHaveBeenLastCalledWith(0.6);

    fireEvent.keyDown(slider, { key: "PageDown" });
    expect(onSeek).toHaveBeenLastCalledWith(0.4);
  });

  it("jumps to the ends with Home and End", () => {
    const { slider, onSeek } = renderSeekable(0.5);

    fireEvent.keyDown(slider, { key: "Home" });
    expect(onSeek).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(slider, { key: "End" });
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });

  it("clamps keyboard seeking to the ends of the Wave", () => {
    const onSeek = vi.fn();
    const { rerender } = render(
      <Waveform peaks={PEAKS} progress={1} duration={200} onSeek={onSeek} label="Seek" />,
    );

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(1);

    rerender(
      <Waveform peaks={PEAKS} progress={0} duration={200} onSeek={onSeek} label="Seek" />,
    );
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it("ignores keys that are not seek keys", () => {
    const { slider, onSeek } = renderSeekable(0.5);

    fireEvent.keyDown(slider, { key: "a" });
    fireEvent.keyDown(slider, { key: "Enter" });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("does not seek when disabled", () => {
    const onSeek = vi.fn();
    render(
      <Waveform peaks={PEAKS} progress={0.5} duration={200} onSeek={onSeek} disabled label="Seek" />,
    );

    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("renders one bar per peak", () => {
    const { container } = render(<Waveform peaks={placeholderPeaks(12, 1)} readOnly />);
    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(12);
  });
});
