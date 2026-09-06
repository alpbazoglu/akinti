/**
 * List-and-delete helper for a signed-out-for-good account's storage
 * objects (spec §33, `docs/SECURITY.md` — "Storage security"). Object keys
 * in both buckets are `<ownerId>/...` (`audioOriginalPath`/`audioProcessedPath`/
 * `avatarPath`, `src/lib/supabase/config.ts`), so deleting everything an
 * account ever uploaded is "recursively remove `<bucket>/<ownerId>`".
 *
 * `storage.list()` only returns the *immediate* children of a path and
 * represents a nested directory as a pseudo-entry with `id: null` (Supabase
 * Storage's own convention — a real file object always has a non-null
 * `id`). The `audio` bucket nests one level deeper than `avatars`
 * (`<ownerId>/<assetId>/original.<ext>` vs `<ownerId>/<filename>`), so a
 * flat, non-recursive `list()` + `remove()` would silently skip every audio
 * file. `listObjectPathsRecursive` below walks into those pseudo-directories
 * so both bucket layouts are handled the same way, with no bucket-specific
 * branch.
 *
 * Used by `deleteAccount` (`src/app/(app)/settings/actions.ts`) — never the
 * enforcement boundary itself, only cleanup; the real Storage authorization
 * (only the owner may sign/list/delete their own objects) lives in the
 * storage policies (migration 13), which this module's caller already
 * bypasses on purpose via the admin client, the same "admin client only
 * after an authorization check" pattern every other admin-client call site
 * in this codebase follows (the caller here has already verified `user.id`
 * against the real session before ever reaching this helper).
 */

export interface StorageObjectEntry {
  readonly name: string;
  readonly id: string | null;
}

export interface StorageListError {
  readonly message: string;
}

export interface StorageListResult {
  readonly data: readonly StorageObjectEntry[] | null;
  readonly error: StorageListError | null;
}

export interface StorageRemoveResult {
  readonly error: StorageListError | null;
}

/** The subset of a Supabase Storage bucket client this module needs. */
export interface StorageBucketClient {
  list(path: string, options: { limit: number; offset: number }): Promise<StorageListResult>;
  remove(paths: string[]): Promise<StorageRemoveResult>;
}

/** Entries per `list()` call. Supabase's default/max page size is 100. */
const LIST_PAGE_SIZE = 100;

/** Paths per `remove()` call, to keep each request body small. */
const REMOVE_BATCH_SIZE = 100;

/**
 * Recursively lists every real file path under `prefix` in one bucket
 * client, paginating `LIST_PAGE_SIZE` entries per `list()` call. Returns
 * `[]` for an empty or nonexistent prefix rather than throwing — an account
 * that never uploaded anything to a bucket is the common case, not an
 * error.
 */
export async function listObjectPathsRecursive(
  storage: StorageBucketClient,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await storage.list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) {
      throw new Error(`Failed to list storage path "${prefix}": ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const entryPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        // Pseudo-directory — recurse to reach the real files inside it.
        paths.push(...(await listObjectPathsRecursive(storage, entryPath)));
      } else {
        paths.push(entryPath);
      }
    }

    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return paths;
}

/**
 * Deletes every object under `<userId>/` in one bucket client: a full
 * recursive listing, then batched `remove()` calls (`REMOVE_BATCH_SIZE`
 * paths per call). A no-op (no `remove()` call at all) when nothing exists
 * under the prefix. Throws on the first listing or removal failure — the
 * caller (`deleteAccount`) runs this only AFTER `auth.admin.deleteUser`
 * already succeeded (review3 finding 21), so a failure here never blocks
 * or undoes the account deletion; it just leaves orphaned objects for a
 * later sweep instead of silently destroying recordings while the account
 * (and any retry of this same deletion) survives.
 */
export async function deleteUserStorageObjects(
  storage: StorageBucketClient,
  userId: string,
): Promise<void> {
  const paths = await listObjectPathsRecursive(storage, userId);

  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await storage.remove(batch);
    if (error) {
      throw new Error(`Failed to remove ${batch.length} storage object(s) for "${userId}": ${error.message}`);
    }
  }
}
