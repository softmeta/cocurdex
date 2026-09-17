import { DatabaseSync } from "node:sqlite";
import type { ScriptRunAgentRecord, ScriptRunRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createSqliteSessionRepository } from "../repositories/sqlite-session-repository";
import { createSqliteWorkspaceRepository } from "../repositories/sqlite-workspace-repository";
import { createSchemaSql } from "../schema";
import { createSqliteScriptRunRepository } from "./sqlite-script-run-repository";

const now = "2026-09-16T00:00:00.000Z";

async function createRepository() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  await createSqliteWorkspaceRepository(database).upsert({
    id: "w-1",
    name: "repo",
    rootPaths: ["/tmp/repo"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  const sessions = createSqliteSessionRepository(database);
  for (const id of ["lead", "child"]) {
    await sessions.upsert({
      id,
      workspaceId: "w-1",
      title: id,
      agentType: "claude-agent",
      status: "idle",
      writeMode: "native-write",
      collaborationMode: "default",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    });
  }
  return createSqliteScriptRunRepository(database);
}

const run: ScriptRunRecord = {
  id: "run-1",
  workspaceId: "w-1",
  requesterSessionId: "lead",
  name: "audit",
  script: "return 1;",
  status: "running",
  maxAgents: 5,
  agentCount: 1,
  resultJson: null,
  error: null,
  createdAt: now,
  startedAt: now,
  completedAt: null,
};

const agent: ScriptRunAgentRecord = {
  id: "agent-1",
  runId: "run-1",
  sessionId: "child",
  label: "first",
  status: "running",
  resultJson: null,
  error: null,
  createdAt: now,
  completedAt: null,
};

describe("createSqliteScriptRunRepository", () => {
  it("round-trips runs with their agents and filters by requester", async () => {
    const repository = await createRepository();
    await repository.saveRun(run);
    await repository.saveAgent(agent);
    await repository.saveAgent({
      ...agent,
      status: "completed",
      resultJson: "1",
    });
    expect(await repository.getRun("run-1")).toEqual({
      run,
      agents: [{ ...agent, status: "completed", resultJson: "1" }],
    });
    expect(await repository.listRuns({ requesterSessionId: "lead" })).toEqual([
      run,
    ]);
    expect(await repository.listRuns({ requesterSessionId: "child" })).toEqual(
      [],
    );
  });

  it("marks running runs and their agents as interrupted after a restart", async () => {
    const repository = await createRepository();
    await repository.saveRun(run);
    await repository.saveRun({ ...run, id: "run-2", status: "draft" });
    await repository.saveAgent(agent);
    const later = "2026-09-16T01:00:00.000Z";
    const interrupted = await repository.interruptRunning(later);
    expect(interrupted.map((item) => item.id)).toEqual(["run-1"]);
    expect(await repository.getRun("run-1")).toMatchObject({
      run: { status: "interrupted", completedAt: later },
      agents: [{ status: "cancelled", completedAt: later }],
    });
    expect((await repository.getRun("run-2"))?.run.status).toBe("draft");
  });
});
