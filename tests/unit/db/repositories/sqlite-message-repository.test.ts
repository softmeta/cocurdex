import path from "node:path";
import { createCocurdexDatabase } from "@cocurdex/db/internal/sqlite";
import type { MessageRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function createDatabase() {
  const database = createCocurdexDatabase(
    path.join(tempDirs.createSync("cocurdex-db-"), "cocurdex.sqlite"),
  );
  tempDirs.onCleanup(() => database.close());
  return database;
}

function message(
  id: string,
  role: MessageRecord["role"],
  extra: Partial<MessageRecord> = {},
): MessageRecord {
  return {
    id,
    sessionId: "home",
    role,
    content: `${id} text`,
    attachments: [],
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

describe("latestReplyBySessionId", () => {
  it("skips work reports the user never sees", async () => {
    const database = createDatabase();
    const now = new Date().toISOString();
    await database.workspaces.upsert({
      id: "w",
      name: "workspace",
      rootPaths: ["/tmp/w"],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      sortOrder: 1000,
    });
    await database.sessions.upsert({
      id: "home",
      workspaceId: "w",
      title: "home",
      agentType: "pi",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: null,
    });
    await database.messages.append(message("ask", "user"));
    await database.messages.append(message("answer", "assistant"));
    await database.messages.append(
      message("report", "user", {
        origin: {
          kind: "delegation",
          sessionId: "work",
          sessionTitle: "Fix checkout",
          outcome: "ready",
        },
      }),
    );
    expect((await database.messages.latestReplyBySessionId("home"))?.id).toBe(
      "answer",
    );
  });
});
