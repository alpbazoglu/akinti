"use client";

import { useEffect } from "react";

/** Below this, the grain composite is not worth the frame budget (§5.5). */
const MIN_DEVICE_MEMORY_GB = 4;

interface DeviceMemoryNavigator extends Navigator {
  readonly deviceMemory?: number;
}

/**
 * Turns the grain layer off on low-memory devices (§5.5).
 *
 * `prefers-reduced-transparency` is handled in CSS; this covers the half CSS
 * cannot see. It renders nothing and only ever writes one attribute, so there
 * is no markup to mismatch during hydration.
 */
export function GrainGuard() {
  useEffect(() => {
    const memory = (navigator as DeviceMemoryNavigator).deviceMemory;
    if (typeof memory === "number" && memory < MIN_DEVICE_MEMORY_GB) {
      document.documentElement.dataset.grain = "off";
    }
  }, []);

  return null;
}
