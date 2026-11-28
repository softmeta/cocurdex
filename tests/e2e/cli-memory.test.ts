import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { startFakeAiMemory } from "@cocurdex/test-fixtures/fake-ai-memory";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { writeFakeRsrs } from "@cocurdex/test-harness/fixtures/fake-rsrs/index.mjs";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();

const SEED = {
  revision: 1,
  deleted: [],
  log: [],
  live: [
    {
      id: "m-tea",
      title: "Prefers tea",
      content: "Green tea in the morning",
      project: "cocurdex/me",
      tags: ["taste"],
    },
    {
      id: "m-coach",
      title: "Runs on Tuesdays",
      content: "Training plan",
      project: "cocurdex/agent/coach",
      tags: [],
    },
  ],
};

describe("cocurdex memory CLI", () => {
  afterAll(async () => {
    await tempDirs.cleanup();
  });

  it("browses and edits its own store and keeps rsrs in step with it", async () => {
    const directory = await tempDirs.create("cocu-memory-");
    const statePath = path.join(directory, "rsrs-state.json");
    await writeFile(statePath, JSON.stringify(SEED), "utf8");
    const rsrsTitles = async () =>
      (
        JSON.parse(await readFile(statePath, "utf8")) as {
          live: { title: string }[];
        }
      ).live
        .map((entry) => entry.title)
        .sort();
    const cliPath = await writeFakeRsrs(directory, { statePath });
    const daemon = await spawnDaemon();
    try {
      const cli = async (args: string[]) => {
        const result = await runCli([...args, "--json"], {
          userDataPath: daemon.userDataPath,
        });
        expect(result.stderr).toBe("");
        expect(result.code).toBe(0);
        return JSON.parse(result.stdout) as unknown;
      };

      const own = (await cli([
        "memory",
        "remember",
        "--title",
        "Likes hiking",
        "--project",
        "cocurdex/me",
        "Long walks on weekends",
      ])) as { id: string };
      expect(await cli(["memory", "list", "--partition", "me"])).toMatchObject({
        error: null,
        items: [{ id: own.id, title: "Likes hiking" }],
      });
      expect(await rsrsTitles()).toEqual(["Prefers tea", "Runs on Tuesdays"]);

      const settings = await requestDaemon(
        "memory.settings.get",
        daemon.options,
      );
      await requestDaemon(
        "memory.settings.set",
        { settings: { ...settings, rsrs: true, cliPath } },
        daemon.options,
      );
      expect(await cli(["memory", "rsrs", "sync", "--dry-run"])).toEqual({
        builtin: { added: 2, updated: 0 },
        external: { added: 1, updated: 0, removed: 0 },
        failed: 0,
      });
      expect(await rsrsTitles()).toEqual(["Prefers tea", "Runs on Tuesdays"]);
      await cli(["memory", "rsrs", "sync"]);
      expect(await rsrsTitles()).toEqual([
        "Likes hiking",
        "Prefers tea",
        "Runs on Tuesdays",
      ]);
      expect(
        await cli(["memory", "list", "--partition", "agent:coach"]),
      ).toMatchObject({ items: [{ id: "m-coach" }] });

      expect(
        await cli(["memory", "update", "m-tea", "--title", "Prefers oolong"]),
      ).toMatchObject({ id: "m-tea", title: "Prefers oolong" });
      await cli(["memory", "forget", "m-tea"]);
      await cli(["memory", "restore", "m-tea"]);
      await cli(["memory", "forget", own.id]);
      expect(await cli(["memory", "history", "m-tea"])).toEqual([
        expect.objectContaining({ entryId: "m-tea", action: "restore" }),
        expect.objectContaining({ entryId: "m-tea", action: "delete" }),
        expect.objectContaining({ entryId: "m-tea", action: "update" }),
        expect.objectContaining({ entryId: "m-tea", action: "create" }),
      ]);

      expect(await cli(["memory", "rsrs", "sync"])).toEqual({
        builtin: { added: 0, updated: 0 },
        external: { added: 0, updated: 1, removed: 1 },
        failed: 0,
      });
      expect(await rsrsTitles()).toEqual([
        "Prefers oolong",
        "Runs on Tuesdays",
      ]);
      expect(await cli(["memory", "rsrs", "sync"])).toEqual({
        builtin: { added: 0, updated: 0 },
        external: { added: 0, updated: 0, removed: 0 },
        failed: 0,
      });

      await cli(["memory", "rsrs", "off"]);
      expect(await cli(["memory", "list", "--partition", "me"])).toMatchObject({
        items: [{ id: "m-tea", title: "Prefers oolong" }],
      });

      const missing = await runCli(["memory", "forget", "nope"], {
        userDataPath: daemon.userDataPath,
      });
      expect(missing.code).not.toBe(0);
      expect(missing.stderr).toContain("nope");
    } finally {
      await daemon.dispose();
    }
  });

  it("switches the external library to ai-memory and keeps it in step", async () => {
    const aiMemory = await startFakeAiMemory();
    const daemon = await spawnDaemon({
      env: { AI_MEMORY_AUTH_TOKEN: aiMemory.token },
    });
    try {
      const cli = async (args: string[]) => {
        const result = await runCli([...args, "--json"], {
          userDataPath: daemon.userDataPath,
        });
        expect(result.stderr).toBe("");
        expect(result.code).toBe(0);
        return JSON.parse(result.stdout) as unknown;
      };
      const own = (await cli([
        "memory",
        "remember",
        "--title",
        "Likes hiking",
        "Long walks on weekends",
      ])) as { id: string };

      const noLibrary = await runCli(["memory", "provider", "sync"], {
        userDataPath: daemon.userDataPath,
      });
      expect(noLibrary.code).not.toBe(0);

      expect(
        await cli([
          "memory",
          "provider",
          "use",
          "ai-memory",
          "--server-url",
          `${aiMemory.url}/`,
        ]),
      ).toMatchObject({
        provider: "ai-memory",
        providers: { aiMemory: { serverUrl: aiMemory.url } },
      });
      expect(await cli(["memory", "provider"])).toMatchObject({
        provider: "ai-memory",
        status: { id: "ai-memory", available: true, version: "3.6.4" },
      });
      expect(await cli(["memory", "provider", "sync"])).toMatchObject({
        external: { added: 1 },
        failed: 0,
      });
      expect([...aiMemory.pages.values()].map((page) => page.title)).toEqual([
        "Likes hiking",
      ]);
      expect(await cli(["memory", "recall", "hiking"])).toMatchObject({
        items: [{ id: own.id }],
      });

      const rsrsSync = await runCli(["memory", "rsrs", "sync"], {
        userDataPath: daemon.userDataPath,
      });
      expect(rsrsSync.code).not.toBe(0);

      expect(await cli(["memory", "provider", "use", "none"])).toMatchObject({
        provider: null,
      });
      expect(await cli(["memory", "list"])).toMatchObject({
        items: [{ id: own.id, title: "Likes hiking" }],
      });
    } finally {
      await daemon.dispose();
      await aiMemory.close();
    }
  });
});
