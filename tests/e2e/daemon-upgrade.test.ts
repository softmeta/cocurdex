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
  it("migrates a pre-release database and keeps its workspaces", async () => {
    const userDataPath = mkdtempSync(
      path.join(tmpdir(), "cocurdex-e2e-upgrade-"),
    );
    const databasePath = getDatabasePath(userDataPath);
    const seeded = createCocurdexDatabase(databasePath);
    await seeded.workspaces.upsert({
      id: "workspace-1",
      name: "repo-a",
      rootPaths: ["/tmp/repo-a"],
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
      lastOpenedAt: "2026-06-25T00:00:00.000Z",
      sortOrder: 1000,
    });
    seeded.close();

    const stale = new DatabaseSync(databasePath);
    const currentVersion =
      (stale.prepare("PRAGMA user_version").get() as PragmaRow | undefined)
        ?.user_version ?? 0;
    expect(currentVersion).toBeGreaterThan(0);
    stale.exec(`PRAGMA user_version = ${currentVersion - 1}`);
    stale.close();

    const daemon = await spawnDaemon({ userDataPath });
    try {
      const workspaces = await requestDaemon("workspace.list", daemon.options);
      expect(workspaces).toMatchObject([
        { id: "workspace-1", rootPaths: ["/tmp/repo-a"] },
      ]);

      const note = await requestDaemon(
        "note.create",
        { title: "after migrate" },
        daemon.options,
      );
      const fetched = await requestDaemon(
        "note.get",
        { id: note.id },
        daemon.options,
      );
      expect(fetched).toMatchObject({ title: "after migrate" });

      const migrated = new DatabaseSync(databasePath);
      const version =
        (migrated.prepare("PRAGMA user_version").get() as PragmaRow | undefined)
          ?.user_version ?? 0;
      migrated.close();
      expect(version).toBe(currentVersion);
    } finally {
      await daemon.dispose();
    }
  });
});
