import type { AbstractIntlMessages } from "next-intl";

/**
 * Narrow a full `next-intl` messages object down to a fixed list of
 * top-level namespaces (review3 finding 12).
 *
 * `NextIntlClientProvider` with no explicit `messages` prop calls
 * `getMessages()` internally and ships the ENTIRE resolved messages object
 * (all namespaces) into the RSC payload for every route it wraps —
 * `src/messages/en.json`/`tr.json` are ~59-61KB, riding along even on
 * `/login` or the `/~offline` fallback, which need a handful of keys. A
 * nested `NextIntlClientProvider` does NOT merge its `messages` with an
 * ancestor's (this is `next-intl`'s documented behaviour, not a bug to work
 * around) — it fully replaces what a `useTranslations()` call underneath it
 * can see. So each subtree that renders its own `NextIntlClientProvider`
 * must pass a SELF-SUFFICIENT set covering every namespace anything in that
 * subtree (including client components it imports) actually calls
 * `useTranslations`/`getTranslations` with — verified by grepping the
 * subtree, not guessed.
 */
export function pickMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const picked: Record<string, unknown> = {};
  for (const namespace of namespaces) {
    if (Object.prototype.hasOwnProperty.call(messages, namespace)) {
      picked[namespace] = (messages as Record<string, unknown>)[namespace];
    }
  }
  return picked as AbstractIntlMessages;
}
