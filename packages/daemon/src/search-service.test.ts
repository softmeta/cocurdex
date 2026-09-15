import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorkspaceSearchDaemonEvent } from "@cocurdex/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DaemonSearchService,
  getUtf16RangeFromByteOffsets,
} from "./search-service";

function byteOffset(text: string, marker: string) {
  return Buffer.byteLength(text.slice(0, text.indexOf(marker)), "utf8");
}

describe("getUtf16RangeFromByteOffsets", () => {
  it("converts ASCII byte offsets to 1-based UTF-16 columns", () => {
    const text = "hello world";
    const start = byteOffset(text, "world");
    const end = start + Buffer.byteLength("world", "utf8");

    expect(getUtf16RangeFromByteOffsets(Buffer.from(text), start, end)).toEqual(
      {
        endColumn: 12,
        startColumn: 7,
      },
    );
  });

  it("handles CJK characters before the match", () => {
    const text = "你好 search";
    const start = byteOffset(text, "search");
    const end = start + Buffer.byteLength("search", "utf8");

    expect(getUtf16RangeFromByteOffsets(Buffer.from(text), start, end)).toEqual(
      {
        endColumn: 10,
        startColumn: 4,
      },
    );
  });

  it("counts emoji as UTF-16 surrogate pairs", () => {
    const text = "a😀bc";
    const start = byteOffset(text, "b");
    const end = start + Buffer.byteLength("b", "utf8");

    expect(getUtf16RangeFromByteOffsets(Buffer.from(text), start, end)).toEqual(
      {
        endColumn: 5,
        startColumn: 4,
      },
    );
  });
});

describe("DaemonSearchService", () => {
  const basePayload = {
    searchId: "search-1",
    rootPath: "/repo",
    query: "needle",
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    maxResults: 100,
    include: "",
    exclude: "",
  };

  it("rejects roots outside the known workspace scan roots", async () => {
    const service = new DaemonSearchService({
      broadcast: () => {},
      canScanRoot: async () => false,
    });

    await expect(service.start(basePayload)).rejects.toThrow(
      "search.start rejected",
    );
    expect(service.activeCount).toBe(0);
  });

  it("emits an empty-query done event without spawning ripgrep", async () => {
    const events: unknown[] = [];
    const service = new DaemonSearchService({
      broadcast: (event) => events.push(event),
      canScanRoot: async () => true,
    });

    await service.start({ ...basePayload, query: "   " });

    expect(events).toEqual([
      { type: "search.done", reason: "empty-query", searchId: "search-1" },
    ]);
    expect(service.activeCount).toBe(0);
  });

  describe("with real ripgrep", () => {
    let rootPath: string;

    beforeAll(async () => {
      rootPath = await mkdtemp(path.join(tmpdir(), "cocurdex-search-"));
      await writeFile(
        path.join(rootPath, "alpha.txt"),
        "needle one\nhay\n",
        "utf8",
      );
      await writeFile(
        path.join(rootPath, "beta.txt"),
        "hay\nneedle two\n",
        "utf8",
      );
    });

    afterAll(async () => {
      await rm(rootPath, { recursive: true, force: true });
    });

    function collectUntilDone(searchId: string) {
      const events: WorkspaceSearchDaemonEvent[] = [];
      let resolveDone!: () => void;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      const service = new DaemonSearchService({
        broadcast: (event) => {
          events.push(event);
          if (event.type !== "search.result") {
            resolveDone();
          }
        },
        canScanRoot: async () => true,
      });
      return { done, events, searchId, service };
    }

    it("streams matches and completes", async () => {
      const { done, events, searchId, service } = collectUntilDone("s-1");

      await service.start({
        ...basePayload,
        rootPath,
        searchId,
      });
      await done;

      const matches = events
        .filter((event) => event.type === "search.result")
        .flatMap((event) =>
          event.type === "search.result" ? event.batch : [],
        );
      expect(matches).toHaveLength(2);
      expect(
        matches.map((match) => path.basename(match.filePath)).sort(),
      ).toEqual(["alpha.txt", "beta.txt"]);
      expect(matches[0].ranges[0].startColumn).toBe(1);
      expect(events.at(-1)).toEqual({
        type: "search.done",
        reason: "completed",
        searchId,
      });
      expect(service.activeCount).toBe(0);
    });
  });
});
