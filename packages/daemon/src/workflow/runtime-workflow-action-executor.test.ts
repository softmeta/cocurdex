import {
  createPlanExecuteReviewWorkflow,
  transitionWorkflow,
  type WorkflowExecutorBindings,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  RuntimeWorkflowActionExecutor,
  type WorkflowAgentTurnRunner,
} from "./runtime-workflow-action-executor";

const bindings: WorkflowExecutorBindings = {
  planner: { agentId: "codex", permissionProfile: "read_only" },
  implementer: {
    agentId: "opencode",
    permissionProfile: "workspace_write",
  },
  reviewer: { agentId: "codex", permissionProfile: "read_only" },
};

function createPlanningAttempt() {
  let nextId = 0;
  const context = {
    now: "2026-08-09T00:00:00.000Z",
    createId: () => `id-${++nextId}`,
  };
  const created = createPlanExecuteReviewWorkflow(
    {
      workspaceId: "workspace-1",
      workspaceRootPath: "/workspace",
      prompt: "Implement durable workflows",
      bindings,
    },
    context,
  );
  const started = transitionWorkflow(
    created,
    { type: "start" },
    context,
  ).aggregate;
  return transitionWorkflow(
    started,
    { type: "begin_attempt", stepId: "plan" },
    context,
  ).aggregate;
}

describe("RuntimeWorkflowActionExecutor", () => {
  it("executes an agent turn and returns a typed workflow command", async () => {
    const aggregate = createPlanningAttempt();
    const action = aggregate.actions[0];
    const attempt = aggregate.attempts[0];
    if (!action || !attempt) throw new Error("Missing workflow fixtures");
    const checkpoints: unknown[] = [];
    const runner: WorkflowAgentTurnRunner = {
      async run(input) {
        expect(input).toMatchObject({
          workspaceRootPath: "/workspace",
          attempt: { id: attempt.id },
        });
        expect(input.prompt).toContain("Implement durable workflows");
        await input.checkpointAttempt(
          {
            adapterId: "codex",
            providerSessionId: "provider-session-1",
            providerOperationId: null,
            resumeToken: null,
          },
          "workflow-session-1",
        );
        return {
          content: '{"summary":"Plan ready"}',
          providerOperationId: "assistant-message-1",
        };
      },
    };
    const executor = new RuntimeWorkflowActionExecutor(runner);

    const result = await executor.execute({
      action,
      aggregate,
      attempt,
      signal: new AbortController().signal,
      checkpointAttempt: async (identity, sessionId) => {
        checkpoints.push({ identity, sessionId });
      },
      renewLease: async () => undefined,
    });

    expect(checkpoints).toMatchObject([
      {
        identity: { providerSessionId: "provider-session-1" },
        sessionId: "workflow-session-1",
      },
      {
        identity: {
          providerSessionId: "provider-session-1",
          providerOperationId: "assistant-message-1",
        },
        sessionId: "workflow-session-1",
      },
    ]);
    expect(result).toMatchObject({
      command: {
        type: "complete_step",
        stepId: "plan",
        outcome: "completed",
        artifact: {
          schemaId: "plan_artifact.v1",
          content: { summary: "Plan ready" },
        },
      },
      result: { providerOperationId: "assistant-message-1" },
    });
  });
});
