import { DatabaseSync } from "node:sqlite";
import {
  createPlanExecuteReviewWorkflow,
  transitionWorkflow,
  type WorkflowExecutorBindings,
} from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqliteWorkflowRepository } from "./sqlite-workflow-repository";
import { WorkflowRevisionConflictError } from "./workflow-repository";

const bindings: WorkflowExecutorBindings = {
  planner: {
    agentId: "claude-agent",
    permissionProfile: "read_only",
  },
  implementer: {
    agentId: "opencode",
    permissionProfile: "workspace_write",
  },
  reviewer: { agentId: "codex", permissionProfile: "read_only" },
};

function createContext() {
  let nextId = 0;
  return {
    now: "2026-08-09T00:00:00.000Z",
    createId: () => `id-${++nextId}`,
  };
}

describe("SqliteWorkflowRepository", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(createSchemaSql());
    database
      .prepare(
        `INSERT INTO workspaces (
           id, name, root_path, created_at, updated_at, last_opened_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "workspace-1",
        "Workspace",
        "/workspace",
        "2026-08-09T00:00:00.000Z",
        "2026-08-09T00:00:00.000Z",
        "2026-08-09T00:00:00.000Z",
      );
  });

  afterEach(() => database.close());

  it("persists a frozen aggregate and commits its first outbox action", async () => {
    const context = createContext();
    const repository = createSqliteWorkflowRepository(database);
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    await repository.create(created);

    const started = transitionWorkflow(
      created,
      { type: "start" },
      context,
    ).aggregate;
    await repository.commit(started, 0);

    const restored = await repository.get(started.run.id);
    expect(restored).toEqual(started);
    expect(restored?.actions).toMatchObject([
      { type: "execute_agent_step", status: "pending" },
    ]);
  });

  it("rejects stale aggregate commits", async () => {
    const context = createContext();
    const repository = createSqliteWorkflowRepository(database);
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    await repository.create(created);
    const started = transitionWorkflow(
      created,
      { type: "start" },
      context,
    ).aggregate;
    await repository.commit(started, 0);

    await expect(repository.commit(started, 0)).rejects.toBeInstanceOf(
      WorkflowRevisionConflictError,
    );
  });

  it("renews a claimed action and settles it with the aggregate atomically", async () => {
    const context = createContext();
    const repository = createSqliteWorkflowRepository(database);
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    const started = transitionWorkflow(
      created,
      { type: "start" },
      context,
    ).aggregate;
    await repository.create(started);

    const claimed = await repository.claimNextAction({
      workerId: "worker-1",
      now: context.now,
      leaseExpiresAt: "2026-08-09T00:01:00.000Z",
    });
    expect(claimed).toMatchObject({
      status: "claimed",
      leaseOwner: "worker-1",
      attemptCount: 1,
    });
    expect(
      await repository.claimNextAction({
        workerId: "worker-2",
        now: context.now,
        leaseExpiresAt: "2026-08-09T00:01:00.000Z",
      }),
    ).toBeNull();

    expect(
      await repository.renewActionLease({
        actionId: claimed?.id ?? "missing",
        workerId: "worker-2",
        now: context.now,
        leaseExpiresAt: "2026-08-09T00:02:00.000Z",
      }),
    ).toBeNull();

    const renewed = await repository.renewActionLease({
      actionId: claimed?.id ?? "missing",
      workerId: "worker-1",
      now: context.now,
      leaseExpiresAt: "2026-08-09T00:02:00.000Z",
    });
    expect(renewed?.leaseExpiresAt).toBe("2026-08-09T00:02:00.000Z");

    const begun = transitionWorkflow(
      started,
      { type: "begin_attempt", stepId: "plan" },
      context,
    ).aggregate;
    const completed = await repository.settleAction({
      actionId: claimed?.id ?? "missing",
      workerId: "worker-1",
      aggregate: begun,
      expectedRevision: started.run.revision,
      status: "completed",
      result: { attemptId: begun.attempts[0]?.id },
      settledAt: context.now,
    });
    expect(completed).toMatchObject({
      status: "completed",
      result: { attemptId: begun.attempts[0]?.id },
      leaseOwner: null,
    });
  });

  it("does not dispatch actions after their workflow is cancelled", async () => {
    const context = createContext();
    const repository = createSqliteWorkflowRepository(database);
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    const started = transitionWorkflow(
      created,
      { type: "start" },
      context,
    ).aggregate;
    await repository.create(started);

    const cancelled = transitionWorkflow(
      started,
      { type: "cancel" },
      context,
    ).aggregate;
    await repository.commit(cancelled, started.run.revision);

    expect(
      await repository.claimNextAction({
        workerId: "worker-1",
        now: context.now,
        leaseExpiresAt: "2026-08-09T00:01:00.000Z",
      }),
    ).toBeNull();
    expect((await repository.get(cancelled.run.id))?.actions).toMatchObject([
      { status: "cancelled", leaseOwner: null },
    ]);
  });

  it("rolls back action settlement when the workflow revision is stale", async () => {
    const context = createContext();
    const repository = createSqliteWorkflowRepository(database);
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    const started = transitionWorkflow(
      created,
      { type: "start" },
      context,
    ).aggregate;
    await repository.create(started);
    const claimed = await repository.claimNextAction({
      workerId: "worker-1",
      now: context.now,
      leaseExpiresAt: "2026-08-09T00:01:00.000Z",
    });
    const begun = transitionWorkflow(
      started,
      { type: "begin_attempt", stepId: "plan" },
      context,
    ).aggregate;
    await repository.commit(begun, started.run.revision);
    const completed = transitionWorkflow(
      begun,
      {
        type: "complete_step",
        stepId: "plan",
        outcome: "completed",
        artifact: {
          schemaId: "plan_artifact.v1",
          content: { summary: "Plan" },
          contentHash: "plan-hash",
        },
      },
      context,
    ).aggregate;

    await expect(
      repository.settleAction({
        actionId: claimed?.id ?? "missing",
        workerId: "worker-1",
        aggregate: completed,
        expectedRevision: started.run.revision,
        status: "completed",
        settledAt: context.now,
      }),
    ).rejects.toBeInstanceOf(WorkflowRevisionConflictError);

    const restored = await repository.get(created.run.id);
    expect(restored?.run.status).toBe("running");
    expect(restored?.actions[0]).toMatchObject({
      status: "claimed",
      leaseOwner: "worker-1",
    });
    expect(restored?.artifacts).toHaveLength(0);
  });
});
