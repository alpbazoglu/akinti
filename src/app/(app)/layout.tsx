import type { ReactNode } from "react";

import { AppShell } from "@/components/layout";

/**
 * Layout for every signed-in surface. Auth (`(auth)`) and the dev gallery
 * (`(dev)`) deliberately sit outside this shell.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
