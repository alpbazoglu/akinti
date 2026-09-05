"use client";

import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";

export interface MotionProviderProps {
  children: ReactNode;
}

/**
 * Motion's feature bundle, loaded once at the root.
 *
 * `LazyMotion` + `domAnimation` is what keeps Motion at roughly 15KB instead
 * of the full 34KB bundle (`docs/research/libraries.md` §5), which matters
 * against the 150KB initial-JS budget in `mobile-guidelines.md` rule 42.
 * Components animate with `m.*` rather than `motion.*`; `strict` makes that a
 * build-time error instead of a silent regression.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
