/**
 * Plain numeric limits shared between a Zod schema (server-side validation)
 * and a Client Component that only needs the number itself (e.g. a
 * `maxLength`/remaining-character count in the UI).
 *
 * Deliberately zod-free: `src/lib/validation/waves.ts` imports `zod` at
 * module scope to build several schemas, and a bundler cannot safely
 * tree-shake unused `z.object(...)` calls (they're function calls, not pure
 * data) out of a Client Component's chunk. Before this file existed,
 * `CommentComposer.tsx` importing `COMMENT_MAX_LENGTH` from `waves.ts` for
 * one integer pulled the whole `zod` runtime plus every unrelated Wave
 * validation schema into every Wave page's first load — closeout perf
 * pass, `/w/[id]` was over its 340KB budget.
 */

/** Mirrors the `comments_body_len` CHECK constraint (migration 05) exactly. */
export const COMMENT_MAX_LENGTH = 1000;
