import { describe, expect, it, vi } from "vitest";
import { createMarkdownFileExistenceCache } from "@/components/markdown-file-existence-cache";

describe("createMarkdownFileExistenceCache", () => {
  it("serves a stale result while revalidating it", async () => {
    let now = 0;
    let resolveRefresh: ((exists: boolean) => void) | undefined;
    const checkExists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    const cache = createMarkdownFileExistenceCache({
      now: () => now,
      positiveTtlMs: 10,
    });

    await cache.probe(checkExists, "/repo/file.ts");
    now = 11;
    const refresh = cache.probe(checkExists, "/repo/file.ts");

    expect(cache.getSnapshot("/repo/file.ts")).toBe(true);
    resolveRefresh?.(false);
    await refresh;
    expect(cache.getSnapshot("/repo/file.ts")).toBe(false);
  });

  it("keeps the last good result after failure and retries later", async () => {
    let now = 0;
    const checkExists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(false);
    const cache = createMarkdownFileExistenceCache({
      now: () => now,
      positiveTtlMs: 10,
    });

    await cache.probe(checkExists, "/repo/file.ts");
    now = 11;
    await cache.probe(checkExists, "/repo/file.ts");
    expect(cache.getSnapshot("/repo/file.ts")).toBe(true);

    await cache.probe(checkExists, "/repo/file.ts");
    expect(checkExists).toHaveBeenCalledTimes(3);
    expect(cache.getSnapshot("/repo/file.ts")).toBe(false);
  });
});
