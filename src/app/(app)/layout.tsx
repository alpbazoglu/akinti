import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout";

/**
 * Layout for every signed-in surface. Auth (`(auth)`) and the dev gallery
 * (`(dev)`) deliberately sit outside this shell.
 *
 * Renders its own `NextIntlClientProvider` with the FULL messages set: the
 * root layout's provider only carries a small fallback namespace list
 * (review3 finding 12), and a nested provider does not merge with an
 * ancestor's — every one of the 40+ screens under this shell draws from
 * most of the message catalog, so narrowing per-route here is future work
 * (tracked, not attempted in this pass); this restores exactly today's
 * behaviour for everything under `(app)`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages}>
      <AppShell>{children}</AppShell>
    </NextIntlClientProvider>
  );
}
