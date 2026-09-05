import { describe, expect, it, vi } from "vitest";

import {
  deleteUserStorageObjects,
  listObjectPathsRecursive,
  type StorageBucketClient,
  type StorageObjectEntry,
} from "./userObjects";

/**
 * Minimal fake of a Supabase Storage bucket client, addressed by full path
 * (`"<userId>/<assetId>/original.wav"`). Directories are inferred: a path
 * segment that isn't itself a stored file is reported back as a
 * pseudo-directory entry (`id: null`), matching real Supabase Storage
 * behaviour.
 */
function createFakeBucket(files: string[]): StorageBucketClient & { removed: string[][] } {
  const removed: string[][] = [];

  function childrenOf(prefix: string): StorageObjectEntry[] {
    const seen = new Map<string, boolean>(); // name -> isFile
    const prefixSegments = prefix === "" ? [] : prefix.split("/");

    for (const file of files) {
      const segments = file.split("/");
      if (segments.length <= prefixSegments.length) continue;
      if (!prefixSegments.every((seg, i) => segments[i] === seg)) continue;
      const name = segments[prefixSegments.length];
      const isFile = segments.length === prefixSegments.length + 1;
      // A name can appear once as a directory and never as a file at this
      // level, or exactly once as a file — never both in this fixture.
      seen.set(name, seen.get(name) || isFile);
    }

    return Array.from(seen.entries()).map(([name, isFile]) => ({
      name,
      id: isFile ? `id:${prefix}/${name}` : null,
    }));
  }

  return {
    removed,
    async list(path, options) {
      const all = childrenOf(path);
      const page = all.slice(options.offset, options.offset + options.limit);
      return { data: page, error: null };
    },
    async remove(paths) {
      removed.push(paths);
      for (const path of paths) {
        const idx = files.indexOf(path);
        if (idx !== -1) files.splice(idx, 1);
      }
      return { error: null };
    },
  };
}

describe("listObjectPathsRecursive", () => {
  it("returns an empty array for a prefix with nothing under it", async () => {
    const bucket = createFakeBucket([]);
    await expect(listObjectPathsRecursive(bucket, "user-a")).resolves.toEqual([]);
  });

  it("lists flat files directly under the prefix (avatars bucket shape)", async () => {
    const bucket = createFakeBucket(["user-a/photo.png"]);
    await expect(listObjectPathsRecursive(bucket, "user-a")).resolves.toEqual(["user-a/photo.png"]);
  });

  it("recurses into nested pseudo-directories (audio bucket shape)", async () => {
    const bucket = createFakeBucket([
      "user-a/asset-1/original.wav",
      "user-a/asset-1/processed.wav",
      "user-a/asset-2/original.mp3",
    ]);
    const paths = await listObjectPathsRecursive(bucket, "user-a");
    expect(paths.sort()).toEqual(
      [
        "user-a/asset-1/original.wav",
        "user-a/asset-1/processed.wav",
        "user-a/asset-2/original.mp3",
      ].sort(),
    );
  });

  it("never returns another user's objects", async () => {
    const bucket = createFakeBucket(["user-a/asset-1/original.wav", "user-b/asset-9/original.wav"]);
    const paths = await listObjectPathsRecursive(bucket, "user-a");
    expect(paths).toEqual(["user-a/asset-1/original.wav"]);
  });

  it("paginates across multiple list() calls", async () => {
    const files = Array.from({ length: 5 }, (_, i) => `user-a/file-${i}.wav`);
    const bucket = createFakeBucket(files);
    const listSpy = vi.spyOn(bucket, "list");

    const paths = await listObjectPathsRecursive(bucket, "user-a");

    // Force pagination by asking for one page at a time.
    let offset = 0;
    let calls = 0;
    for (;;) {
      const { data } = await bucket.list("user-a", { limit: 2, offset });
      calls += 1;
      if (!data || data.length === 0) break;
      offset += data.length;
      if (data.length < 2) break;
    }
    expect(calls).toBeGreaterThan(1);
    expect(paths).toHaveLength(5);
    listSpy.mockRestore();
  });

  it("throws when the underlying list() call errors", async () => {
    const bucket: StorageBucketClient = {
      async list() {
        return { data: null, error: { message: "network down" } };
      },
      async remove() {
        return { error: null };
      },
    };
    await expect(listObjectPathsRecursive(bucket, "user-a")).rejects.toThrow(/network down/);
  });
});

describe("deleteUserStorageObjects", () => {
  it("is a no-op when nothing exists under the prefix", async () => {
    const bucket = createFakeBucket([]);
    await deleteUserStorageObjects(bucket, "user-a");
    expect(bucket.removed).toEqual([]);
  });

  it("removes every recursively-listed path", async () => {
    const bucket = createFakeBucket([
      "user-a/asset-1/original.wav",
      "user-a/asset-1/processed.wav",
      "user-b/asset-9/original.wav",
    ]);
    await deleteUserStorageObjects(bucket, "user-a");

    const removedPaths = bucket.removed.flat();
    expect(removedPaths.sort()).toEqual(
      ["user-a/asset-1/original.wav", "user-a/asset-1/processed.wav"].sort(),
    );
    // The other user's object was never touched.
    expect(removedPaths).not.toContain("user-b/asset-9/original.wav");
  });

  it("batches removal across multiple remove() calls for large listings", async () => {
    const files = Array.from({ length: 250 }, (_, i) => `user-a/asset-${i}/original.wav`);
    const bucket = createFakeBucket(files);

    await deleteUserStorageObjects(bucket, "user-a");

    expect(bucket.removed.length).toBeGreaterThanOrEqual(3);
    expect(bucket.removed.flat()).toHaveLength(250);
  });

  it("throws and stops on the first removal failure", async () => {
    const bucket: StorageBucketClient = {
      async list(path, options) {
        if (options.offset > 0) return { data: [], error: null };
        return { data: [{ name: "photo.png", id: "id:1" }], error: null };
      },
      async remove() {
        return { error: { message: "storage unavailable" } };
      },
    };
    await expect(deleteUserStorageObjects(bucket, "user-a")).rejects.toThrow(/storage unavailable/);
  });
});
