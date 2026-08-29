import {
  createPlanExecuteReviewWorkflow,
  transitionWorkflow,
  type WorkflowExecutorBindings,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowAgentPrompt,
  parseWorkflowAgentOutput,
} from "./workflow-agent-contract";

const bindings: WorkflowExecutorBindings = {
  planner: { agentId: "codex", permissionProfile: "read_only" },
  implementer: {
    agentId: "opencode",
    permissionProfile: "workspace_write",
  },
  reviewer: { agentId: "codex", permissionProfile: "read_only" },
};

function createStartedWorkflow() {
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
  return transitionWorkflow(created, { type: "start" }, context).aggregate;
}

describe("workflow agent contract", () => {
  it("builds a provider-neutral prompt with an exact output contract", () => {
    const prompt = buildWorkflowAgentPrompt(createStartedWorkflow(), "plan");

    expect(prompt).toContain("Implement durable workflows");
    expect(prompt).toContain('"schemaId": "plan_artifact.v1"');
    expect(prompt).toContain("Return exactly one JSON object");
    expect(prompt).not.toContain("Claude");
    expect(prompt).not.toContain("Codex");
  });

  it("turns a fenced plan result into a validated workflow command", () => {
    const result = parseWorkflowAgentOutput(
      createStartedWorkflow(),
      "plan",
      `\`\`\`json
{"summary":"Inspect and implement","steps":["a"],"acceptanceCriteria":[]}
\`\`\``,
    );

    expect(result).toEqual({
      command: {
        type: "complete_step",
        stepId: "plan",
        outcome: "completed",
        artifact: {
          schemaId: "plan_artifact.v1",
          content: {
            summary: "Inspect and implement",
            steps: ["a"],
            acceptanceCriteria: [],
          },
          contentHash:
            "sha256:bcb4985652802a1b0e92c8e2f6122e8e69f59e2e36fa4bb36a44af5e020016a2",
        },
      },
    });
  });

  it("rejects prose around the structured result", () => {
    expect(() =>
      parseWorkflowAgentOutput(
        createStartedWorkflow(),
        "plan",
        'Plan ready: {"summary":"Plan"}',
      ),
    ).toThrow("exactly one JSON object");
  });
});
