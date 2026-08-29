import { DatabaseSync } from "node:sqlite";
import { createSchemaSql, createSqliteWorkflowRepository } from "@cocurdex/db";
import {
  createPlanExecuteReviewWorkflow,
  transitionWorkflow,
  type WorkflowExecutorBindings,
} from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkflowModule } from "./workflow-module";
import { type WorkflowActionExecutor, WorkflowWorker } from "./workflow-worker";

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

function createIds() {
  let nextId = 0;
  return () => `id-${++nextId}`;
}

describe("WorkflowWorker", () => {
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

  it("persists an attempt checkpoint and atomically settles its action", async () => {
    const repository = createSqliteWorkflowRepository(database);
    const createId = createIds();
    const context = {
      createId,
      now: "2026-08-09T00:00:00.000Z",
    };
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    await repository.create(
      transitionWorkflow(created, { type: "start" }, context).aggregate,
    );

    const executor: WorkflowActionExecutor = {
      execute: async ({ attempt, checkpointAttempt }) => {
        expect(attempt).toMatchObject({
          executorBinding: { agentId: "claude-agent" },
          status: "running",
        });
        await checkpointAttempt({
          adapterId: "claude-agent",
          providerSessionId: "provider-session-1",
          providerOperationId: "provider-turn-1",
          resumeToken: null,
        });
        return {
          command: {
            type: "complete_step",
            stepId: "plan",
            outcome: "completed",
            artifact: {
              schemaId: "plan_artifact.v1",
              content: { summary: "Plan ready" },
              contentHash: "plan-hash",
            },
          },
          result: { providerOperationId: "provider-turn-1" },
        };
      },
    };
    const worker = new WorkflowWorker(repository, executor, {
      workerId: "worker-1",
      createId,
      now: () => "2026-08-09T00:00:01.000Z",
      leaseDurationMs: 60_000,
    });

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "completed",
      actionType: "execute_agent_step",
    });

    const restored = await repository.get(created.run.id);
    expect(restored?.run.status).toBe("awaiting_gate");
    expect(restored?.attempts).toMatchObject([
      {
        status: "completed",
        runtimeIdentity: {
          adapterId: "claude-agent",
          providerSessionId: "provider-session-1",
          providerOperationId: "provider-turn-1",
        },
      },
    ]);
    expect(restored?.actions).toMatchObject([
      { status: "completed" },
      { status: "pending", type: "request_gate_decision" },
    ]);

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "suspended",
      actionType: "request_gate_decision",
    });
    const awaitingApproval = await repository.get(created.run.id);
    expect(awaitingApproval?.suspensions).toMatchObject([
      {
        reason: "approval_required",
        status: "active",
        stepRunId: awaitingApproval?.steps[1]?.id,
      },
    ]);

    const workflowModule = new WorkflowModule(repository, {
      createId,
      now: () => "2026-08-09T00:00:02.000Z",
    });
    const approved = await workflowModule.decideGate({
      workflowRunId: created.run.id,
      stepId: "approve_plan",
      decision: "approved",
    });
    expect(approved.suspensions[0]).toMatchObject({
      status: "resolved",
      resolvedAt: "2026-08-09T00:00:02.000Z",
    });
  });

  it("reclaims an expired action without creating a duplicate attempt", async () => {
    const repository = createSqliteWorkflowRepository(database);
    const createId = createIds();
    const initialContext = {
      createId,
      now: "2026-08-09T00:00:00.000Z",
    };
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      initialContext,
    );
    const started = transitionWorkflow(
      created,
      { type: "start" },
      initialContext,
    ).aggregate;
    await repository.create(started);
    await repository.claimNextAction({
      workerId: "dead-worker",
      now: "2026-08-09T00:00:01.000Z",
      leaseExpiresAt: "2026-08-09T00:00:02.000Z",
    });
    const begun = transitionWorkflow(
      started,
      {
        type: "begin_attempt",
        stepId: "plan",
        runtimeIdentity: {
          adapterId: "claude-agent",
          providerSessionId: "provider-session-1",
          providerOperationId: "provider-turn-1",
          resumeToken: null,
        },
      },
      { createId, now: "2026-08-09T00:00:01.000Z" },
    ).aggregate;
    await repository.commit(begun, started.run.revision);
    const originalAttemptId = begun.attempts[0]?.id;

    const executor: WorkflowActionExecutor = {
      execute: async ({ attempt }) => {
        if (!attempt) throw new Error("Missing recovered attempt");
        expect(attempt.id).toBe(originalAttemptId);
        return {
          command: {
            type: "complete_step",
            stepId: "plan",
            outcome: "completed",
            artifact: {
              schemaId: "plan_artifact.v1",
              content: { summary: "Recovered plan" },
              contentHash: "recovered-plan-hash",
            },
          },
        };
      },
    };
    const worker = new WorkflowWorker(repository, executor, {
      workerId: "replacement-worker",
      createId,
      now: () => "2026-08-09T00:00:03.000Z",
      leaseDurationMs: 60_000,
    });

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "completed",
    });
    const restored = await repository.get(created.run.id);
    expect(restored?.attempts).toHaveLength(1);
    expect(restored?.steps[0]?.attemptCount).toBe(1);
  });

  it("fails the attempt, run, and claimed action together", async () => {
    const repository = createSqliteWorkflowRepository(database);
    const createId = createIds();
    const context = {
      createId,
      now: "2026-08-09T00:00:00.000Z",
    };
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    await repository.create(
      transitionWorkflow(created, { type: "start" }, context).aggregate,
    );
    const worker = new WorkflowWorker(
      repository,
      {
        execute: async () => {
          throw new Error("provider unavailable");
        },
      },
      {
        workerId: "worker-1",
        createId,
        now: () => "2026-08-09T00:00:01.000Z",
        leaseDurationMs: 60_000,
      },
    );

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "failed",
      error: "provider unavailable",
    });
    const restored = await repository.get(created.run.id);
    expect(restored?.run.status).toBe("failed");
    expect(restored?.attempts[0]?.status).toBe("failed");
    expect(restored?.actions[0]).toMatchObject({
      status: "failed",
      error: "provider unavailable",
    });
  });

  it("does not turn a concurrent user cancellation into a worker failure", async () => {
    const repository = createSqliteWorkflowRepository(database);
    const createId = createIds();
    const context = {
      createId,
      now: "2026-08-09T00:00:00.000Z",
    };
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      context,
    );
    await repository.create(
      transitionWorkflow(created, { type: "start" }, context).aggregate,
    );
    const workflowModule = new WorkflowModule(repository, {
      createId,
      now: () => "2026-08-09T00:00:01.000Z",
    });
    const worker = new WorkflowWorker(
      repository,
      {
        execute: async () => {
          await workflowModule.cancel(created.run.id);
          throw new Error("turn cancelled");
        },
      },
      {
        workerId: "worker-1",
        createId,
        now: () => "2026-08-09T00:00:01.000Z",
        leaseDurationMs: 60_000,
      },
    );

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "cancelled",
    });
    expect((await repository.get(created.run.id))?.run.status).toBe(
      "cancelled",
    );
  });
});
