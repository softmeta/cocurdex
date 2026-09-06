import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqliteAgentRoleRepository } from "./sqlite-agent-role-repository";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  return database;
}

const now = "2026-09-06T00:00:00.000Z";

describe("createSqliteAgentRoleRepository", () => {
  it("round-trips a thin agent role and lists newest first", async () => {
    const repository = createSqliteAgentRoleRepository(createDatabase());

    await repository.upsert({
      id: "older",
      name: "Review",
      agentId: "codex",
      providerId: "openai",
      modelId: "gpt-5.4",
      modelName: "GPT-5.4",
      permissionMode: "codex-read-only",
      collaborationMode: "default",
      reasoningEffort: "high",
      serviceTier: null,
      fastMode: null,
      thinkingLevel: null,
      openCodeAgent: null,
      openCodeVariant: null,
      instructions: null,
      skillIds: null,
      createdAt: now,
      updatedAt: now,
    });
    await repository.upsert({
      id: "newer",
      name: "Implement",
      agentId: "codex",
      providerId: "openai",
      modelId: "gpt-5.4",
      modelName: "GPT-5.4",
      permissionMode: "codex-auto",
      collaborationMode: "default",
      reasoningEffort: "medium",
      serviceTier: null,
      fastMode: false,
      thinkingLevel: null,
      openCodeAgent: null,
      openCodeVariant: null,
      instructions: null,
      skillIds: ["ship"],
      createdAt: now,
      updatedAt: "2026-09-06T01:00:00.000Z",
    });

    const listed = await repository.list();
    expect(listed.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(listed[0]).toMatchObject({
      name: "Implement",
      modelName: "GPT-5.4",
      permissionMode: "codex-auto",
      fastMode: false,
      skillIds: ["ship"],
    });

    await repository.delete("newer");
    expect((await repository.list()).map((item) => item.id)).toEqual(["older"]);
    expect(await repository.getById("newer")).toBeNull();
  });
});
