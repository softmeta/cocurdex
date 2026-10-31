import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDatabasePath } from "@cocurdex/daemon/paths";
import { CURRENT_SCHEMA_VERSION } from "@cocurdex/db/internal/migrations";
import { seedHistoricalDatabase } from "@cocurdex/test-fixtures/database";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";
import { spawnDaemon } from "./helpers/daemon-process";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

describe("daemon startup against historical databases", () => {
  it.each([5, 19, 26])(
    "upgrades schema %s and exposes preserved data through RPC",
    async (version) => {
      const userDataPath = tempDirs.createSync("cocu-upgrade-");
      const workspacePath = path.join(userDataPath, "acme-shop");
      const databasePath = getDatabasePath(userDataPath);
      const seeded = new DatabaseSync(databasePath);
      try {
        seedHistoricalDatabase(seeded, version, workspacePath);
      } finally {
        seeded.close();
      }
      const daemon = await spawnDaemon({ userDataPath });
      try {
        expect(
          await requestDaemon("workspace.list", daemon.options),
        ).toMatchObject([
          { id: "historical-workspace", rootPaths: [workspacePath] },
        ]);
        expect(
          await requestDaemon(
            "session.get",
            { sessionId: "historical-session" },
            daemon.options,
          ),
        ).toMatchObject({
          id: "historical-session",
          title: "Migration session",
          sessionModeId: "plan",
        });
        const messages = await requestDaemon(
          "session.listMessages",
          { sessionId: "historical-session" },
          daemon.options,
        );
        expect(messages.messages).toContainEqual(
          expect.objectContaining({
            id: "historical-message",
            content: "Keep this conversation",
          }),
        );
        expect(
          await requestDaemon(
            "note.get",
            { id: "historical-note" },
            daemon.options,
          ),
        ).toMatchObject({
          title: "Migration note",
          bodyMarkdown: "Preserved note body",
        });
        expect(
          await requestDaemon(
            "issue.get",
            { id: "historical-issue" },
            daemon.options,
          ),
        ).toMatchObject({
          title: "Migration issue",
          description: "Preserved issue body",
        });
        const note = await requestDaemon(
          "note.create",
          { title: "After upgrade" },
          daemon.options,
        );
        expect(
          await requestDaemon("note.get", { id: note.id }, daemon.options),
        ).toMatchObject({ title: "After upgrade" });
        const migrated = new DatabaseSync(databasePath, { readOnly: true });
        try {
          expect(migrated.prepare("PRAGMA user_version").get()).toEqual({
            user_version: CURRENT_SCHEMA_VERSION,
          });
          expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual(
            [],
          );
        } finally {
          migrated.close();
        }
      } finally {
        await daemon.dispose();
      }
    },
  );
});
