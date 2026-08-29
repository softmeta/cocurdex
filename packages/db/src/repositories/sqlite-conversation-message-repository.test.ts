import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCocurdexDatabase } from "../sqlite";

type Database = ReturnType<typeof createCocurdexDatabase>;

function createDatabase() {
  return createCocurdexDatabase(
    path.join(
      mkdtempSync(path.join(tmpdir(), "cocurdex-db-")),
      "cocurdex.sqlite",
    ),
  );
}

async function seedConversation(database: Database, conversationId: string) {
  const now = new Date().toISOString();
  await database.conversations.upsert({
    id: conversationId,
    title: "New chat",
    providerId: "openai",
    modelId: "gpt-5",
    systemPrompt: null,
    presetId: null,
    webSearchEnabled: false,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
  });
}

describe("failStreaming", () => {
  it("marks streaming messages errored and leaves settled ones untouched", async () => {
    const database = createDatabase();
    await seedConversation(database, "conversation-1");
    const now = new Date().toISOString();

    for (const [id, status] of [
      ["streaming-message", "streaming"],
      ["completed-message", "completed"],
      ["errored-message", "errored"],
    ] as const) {
      await database.conversationMessages.upsert({
        id,
        conversationId: "conversation-1",
        role: "assistant",
        content: [{ type: "text", text: "partial" }],
        status,
        usage: null,
        sources: [],
        error: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await database.conversationMessages.failStreaming();

    const messages =
      await database.conversationMessages.listByConversationId(
        "conversation-1",
      );
    const statusById = new Map(messages.map((m) => [m.id, m.status]));
    expect(statusById.get("streaming-message")).toBe("errored");
    expect(statusById.get("completed-message")).toBe("completed");
    expect(statusById.get("errored-message")).toBe("errored");
    // Partial text survives the sweep so the user still sees what arrived.
    expect(messages.find((m) => m.id === "streaming-message")?.content).toEqual(
      [{ type: "text", text: "partial" }],
    );

    database.close();
  });
});
