import { describe, expect, it } from "vitest";
import {
  createPlanExecuteReviewWorkflow,
  transitionWorkflow,
} from "./state-machine";
import type {
  WorkflowExecutorBindings,
  WorkflowTransitionContext,
} from "./types";

function createBindings(): WorkflowExecutorBindings {
  return {
    planner: {
      agentId: "claude-agent",
      model: "planner-model",
      permissionProfile: "read_only",
    },
    implementer: {
      agentId: "opencode",
      model: "implementation-model",
      permissionProfile: "workspace_write",
    },
    reviewer: {
      agentId: "codex",
      model: "review-model",
      permissionProfile: "read_only",
    },
  };
}

function createContext(): WorkflowTransitionContext {
  let nextId = 0;
  return {
    now: "2026-08-09T00:00:00.000Z",
    createId: () => `id-${++nextId}`,
  };
}

describe("plan_execute_review workflow", () => {
  it("freezes executor bindings when a run is created", () => {
    const bindings = createBindings();
    const aggregate = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings,
      },
      createContext(),
    );

    bindings.planner.model = "changed-after-creation";

    expect(aggregate.run.frozenBindings).toMatchObject({
      planner: { agentId: "claude-agent", model: "planner-model" },
      implementer: { agentId: "opencode" },
      reviewer: { agentId: "codex" },
    });
    expect(aggregate.run.frozenDefinition.version).toBe(2);
    expect(aggregate.steps.map((step) => step.stepId)).toEqual([
      "plan",
      "approve_plan",
      "implement",
      "validate",
      "review",
    ]);
  });

  it("starts by scheduling only the planner step", () => {
    const context = createContext();
    const created = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings: createBindings(),
      },
      context,
    );

    const result = transitionWorkflow(created, { type: "start" }, context);

    expect(result.aggregate.run).toMatchObject({
      status: "running",
      currentStepId: "plan",
      revision: 1,
    });
    expect(
      result.aggregate.steps.find((step) => step.stepId === "plan"),
    ).toMatchObject({ status: "ready" });
    expect(result.aggregate.actions).toHaveLength(1);
    expect(result.aggregate.actions[0]).toMatchObject({
      type: "execute_agent_step",
      status: "pending",
      payload: { stepId: "plan", role: "planner" },
    });
  });

  it("moves from a structured plan through approval to the bound implementer", () => {
    const context = createContext();
    let aggregate = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings: createBindings(),
      },
      context,
    );
    aggregate = transitionWorkflow(
      aggregate,
      { type: "start" },
      context,
    ).aggregate;
    aggregate = transitionWorkflow(
      aggregate,
      { type: "begin_attempt", stepId: "plan", sessionId: "session-plan" },
      context,
    ).aggregate;
    aggregate = transitionWorkflow(
      aggregate,
      {
        type: "complete_step",
        stepId: "plan",
        outcome: "completed",
        artifact: {
          schemaId: "plan_artifact.v1",
          content: { summary: "Plan" },
          contentHash: "sha256:plan",
        },
      },
      context,
    ).aggregate;

    expect(aggregate.run).toMatchObject({
      status: "awaiting_gate",
      currentStepId: "approve_plan",
    });
    expect(aggregate.artifacts).toHaveLength(1);
    expect(aggregate.actions.at(-1)).toMatchObject({
      type: "request_gate_decision",
      payload: { stepId: "approve_plan" },
    });

    aggregate = transitionWorkflow(
      aggregate,
      {
        type: "decide_gate",
        stepId: "approve_plan",
        decision: "approved",
        actor: "user",
      },
      context,
    ).aggregate;

    expect(aggregate.run).toMatchObject({
      status: "running",
      currentStepId: "implement",
    });
    expect(aggregate.run.frozenBindings.implementer.agentId).toBe("opencode");
    expect(aggregate.gateDecisions).toMatchObject([
      { decision: "approved", actor: "user" },
    ]);
    expect(aggregate.actions.at(-1)).toMatchObject({
      type: "execute_agent_step",
      payload: { stepId: "implement", role: "implementer" },
    });
  });

  it("exhausts the workflow after more than two requested revisions", () => {
    const context = createContext();
    let aggregate = createPlanExecuteReviewWorkflow(
      {
        workspaceId: "workspace-1",
        workspaceRootPath: "/workspace",
        prompt: "Implement the feature",
        bindings: createBindings(),
      },
      context,
    );
    aggregate.run.status = "running";
    aggregate.run.currentStepId = "review";
    for (let revision = 1; revision <= 3; revision += 1) {
      const reviewStep = aggregate.steps.find(
        (step) => step.stepId === "review",
      );
      if (!reviewStep) {
        throw new Error("Missing review step");
      }
      reviewStep.status = "running";
      aggregate.attempts.push({
        id: `review-attempt-${revision}`,
        workflowRunId: aggregate.run.id,
        stepRunId: reviewStep.id,
        sequence: revision,
        executorBinding: aggregate.run.frozenBindings.reviewer,
        sessionId: null,
        runtimeIdentity: {
          adapterId: aggregate.run.frozenBindings.reviewer.agentId,
          providerSessionId: null,
          providerOperationId: null,
          resumeToken: null,
        },
        status: "running",
        error: null,
        createdAt: context.now,
        updatedAt: context.now,
        completedAt: null,
      });
      aggregate = transitionWorkflow(
        aggregate,
        {
          type: "complete_step",
          stepId: "review",
          outcome: "changes_requested",
          artifact: {
            schemaId: "review_decision.v1",
            content: { verdict: "changes_requested" },
            contentHash: `sha256:review-${revision}`,
          },
        },
        context,
      ).aggregate;

      if (revision < 3) {
        expect(aggregate.run.currentStepId).toBe("implement");
        aggregate.run.currentStepId = "review";
      }
    }

    expect(aggregate.run).toMatchObject({
      status: "exhausted",
      currentStepId: null,
      completedAt: context.now,
    });
  });
});
