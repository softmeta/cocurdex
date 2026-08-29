import type { WorkflowAggregate } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { projectWorkflowTui } from "./workflow-tui-model";

function createAggregate(): WorkflowAggregate {
  const now = "2026-08-09T00:00:00.000Z";
  return {
    run: {
      id: "run-1",
      workspaceId: "workspace-1",
      workspaceRootPath: "/workspace",
      rootPrompt: "Implement the workflow TUI",
      definitionId: "plan_execute_review",
      definitionVersion: 2,
      frozenDefinition: {
        definitionId: "plan_execute_review",
        version: 2,
        steps: [
          {
            id: "plan",
            kind: "agent",
            role: "planner",
            permissionProfile: "read_only",
            inputSchemas: [],
            outputSchema: "plan_artifact.v1",
            maxAttempts: 2,
          },
          {
            id: "approve_plan",
            kind: "gate",
            permissionProfile: "read_only",
            inputSchemas: ["plan_artifact.v1"],
            maxAttempts: 0,
          },
        ],
        transitions: [],
      },
      frozenBindings: {
        planner: {
          agentId: "codex",
          model: "gpt-5.6-codex",
          permissionProfile: "read_only",
        },
        implementer: {
          agentId: "opencode",
          permissionProfile: "workspace_write",
        },
        reviewer: {
          agentId: "claude-agent",
          permissionProfile: "read_only",
        },
      },
      status: "awaiting_gate",
      currentStepId: "approve_plan",
      revision: 4,
      transitionCounts: {},
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    steps: [
      {
        id: "step-gate",
        workflowRunId: "run-1",
        stepId: "approve_plan",
        kind: "gate",
        role: null,
        status: "awaiting_gate",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
      {
        id: "step-plan",
        workflowRunId: "run-1",
        stepId: "plan",
        kind: "agent",
        role: "planner",
        status: "completed",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    ],
    attempts: [
      {
        id: "attempt-plan",
        workflowRunId: "run-1",
        stepRunId: "step-plan",
        sequence: 1,
        executorBinding: {
          agentId: "codex",
          model: "gpt-5.6-codex",
          permissionProfile: "read_only",
        },
        sessionId: "session-1",
        runtimeIdentity: {
          adapterId: "codex",
          providerSessionId: "provider-session-1",
          providerOperationId: null,
          resumeToken: null,
        },
        status: "completed",
        error: null,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    ],
    artifacts: [
      {
        id: "artifact-plan",
        workflowRunId: "run-1",
        producerAttemptId: "attempt-plan",
        schemaId: "plan_artifact.v1",
        content: { summary: "Use a daemon-owned projection." },
        contentHash: "sha256:plan",
        baselineCommit: null,
        createdAt: now,
      },
    ],
    gateDecisions: [],
    suspensions: [
      {
        id: "suspension-gate",
        workflowRunId: "run-1",
        stepRunId: "step-gate",
        attemptId: null,
        reason: "approval_required",
        message: "Approve the plan before implementation.",
        continuation: null,
        status: "active",
        createdAt: now,
        resolvedAt: null,
      },
    ],
    actions: [],
  };
}

describe("projectWorkflowTui", () => {
  it("orders steps by the frozen definition and joins durable details", () => {
    const view = projectWorkflowTui(createAggregate());

    expect(view.steps.map((step) => step.stepId)).toEqual([
      "plan",
      "approve_plan",
    ]);
    expect(view.steps[0]).toMatchObject({
      isCurrent: false,
      agentId: "codex",
      model: "gpt-5.6-codex",
      attemptStatus: "completed",
      artifactSchemaIds: ["plan_artifact.v1"],
    });
    expect(view.steps[1]).toMatchObject({
      isCurrent: true,
      activeSuspensionReason: "approval_required",
    });
  });

  it("only exposes gate decisions for the current awaiting gate", () => {
    const view = projectWorkflowTui(createAggregate());

    expect(view.actions).toEqual({
      canStart: false,
      canApprove: true,
      canReject: true,
      canCancel: true,
    });

    const completed = createAggregate();
    completed.run.status = "completed";
    completed.run.currentStepId = null;
    completed.steps[0].status = "completed";

    expect(projectWorkflowTui(completed).actions).toEqual({
      canStart: false,
      canApprove: false,
      canReject: false,
      canCancel: false,
    });
  });

  it("allows an explicitly attached created run to be started", () => {
    const aggregate = createAggregate();
    aggregate.run.status = "created";
    aggregate.run.currentStepId = null;
    aggregate.steps[0].status = "pending";

    expect(projectWorkflowTui(aggregate).actions.canStart).toBe(true);
  });
});
