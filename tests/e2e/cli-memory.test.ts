import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
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

  it("browses, edits, deletes, and restores memories by partition", async () => {
    const directory = await tempDirs.create("cocu-memory-");
    const statePath = path.join(directory, "rsrs-state.json");
    await writeFile(statePath, JSON.stringify(SEED), "utf8");
    const cliPath = await writeFakeRsrs(directory, { statePath });
    const daemon = await spawnDaemon();
    try {
      const settings = await requestDaemon(
        "memory.settings.get",
        daemon.options,
      );
      await requestDaemon(
        "memory.settings.set",
        { settings: { ...settings, enabled: true, cliPath } },
        daemon.options,
      );
      const cli = async (args: string[]) => {
        const result = await runCli([...args, "--json"], {
          userDataPath: daemon.userDataPath,
        });
        expect(result.stderr).toBe("");
        expect(result.code).toBe(0);
        return JSON.parse(result.stdout) as unknown;
      };

      expect(await cli(["memory", "list", "--partition", "me"])).toEqual({
        error: null,
        items: [expect.objectContaining({ id: "m-tea", title: "Prefers tea" })],
      });
      expect(
        await cli(["memory", "list", "--partition", "agent:coach"]),
      ).toMatchObject({ items: [{ id: "m-coach" }] });

      expect(
        await cli(["memory", "update", "m-tea", "--title", "Prefers oolong"]),
      ).toMatchObject({ id: "m-tea", title: "Prefers oolong" });
      await cli(["memory", "forget", "m-tea"]);
      expect(await cli(["memory", "list", "--partition", "me"])).toEqual({
        error: null,
        items: [],
      });
      await cli(["memory", "restore", "m-tea"]);

      expect(await cli(["memory", "history", "m-tea"])).toEqual([
        expect.objectContaining({ entryId: "m-tea", action: "restore" }),
        expect.objectContaining({ entryId: "m-tea", action: "delete" }),
        expect.objectContaining({ entryId: "m-tea", action: "update" }),
      ]);
      expect(await cli(["memory", "revision"])).toEqual({ revision: "4" });

      const stored = JSON.parse(await readFile(statePath, "utf8"));
      expect(stored.live).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "m-tea", title: "Prefers oolong" }),
        ]),
      );

      const missing = await runCli(["memory", "forget", "nope"], {
        userDataPath: daemon.userDataPath,
      });
      expect(missing.code).not.toBe(0);
      expect(missing.stderr).toContain("nope");
    } finally {
      await daemon.dispose();
    }
  });
});
