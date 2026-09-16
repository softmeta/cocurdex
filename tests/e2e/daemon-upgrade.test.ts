import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDatabasePath } from "@cocurdex/daemon/paths";
import { createCocurdexDatabase } from "@cocurdex/db";
import { describe, expect, it } from "vitest";
import { spawnDaemon } from "./helpers/daemon-process";

interface PragmaRow {
  user_version?: number;
}

describe("daemon startup against a stale schema version", () => {
  it("recreates a pre-release database and serves requests", async () => {
    const userDataPath = mkdtempSync(
      path.join(tmpdir(), "cocurdex-e2e-upgrade-"),
    );
    const databasePath = getDatabasePath(userDataPath);
    const seeded = createCocurdexDatabase(databasePath);
    seeded.close();

    const stale = new DatabaseSync(databasePath);
    const currentVersion =
      (stale.prepare("PRAGMA user_version").get() as PragmaRow | undefined)
        ?.user_version ?? 0;
    expect(currentVersion).toBeGreaterThan(0);
    stale.exec(`PRAGMA user_version = ${currentVersion - 1}`);
    stale.exec("CREATE TABLE legacy_sentinel (id TEXT)");
    stale.close();

    const daemon = await spawnDaemon({ userDataPath });
    try {
      const note = await requestDaemon(
        "note.create",
        { title: "after recreate" },
        daemon.options,
      );
      const fetched = await requestDaemon(
        "note.get",
        { id: note.id },
        daemon.options,
      );
      expect(fetched).toMatchObject({ title: "after recreate" });

      const recreated = new DatabaseSync(databasePath);
      const version =
        (
          recreated.prepare("PRAGMA user_version").get() as
            | PragmaRow
            | undefined
        )?.user_version ?? 0;
      const sentinel = recreated
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_sentinel'",
        )
        .get();
      recreated.close();
      expect(version).toBe(currentVersion);
      expect(sentinel).toBeUndefined();
    } finally {
      await daemon.dispose();
    }
  });
});
