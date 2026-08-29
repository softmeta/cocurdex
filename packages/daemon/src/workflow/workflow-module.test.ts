import type { WorkflowRepository } from "@cocurdex/db";
import type {
  WorkflowActionRecord,
  WorkflowAggregate,
  WorkflowExecutorBindings,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { WorkflowModule } from "./workflow-module";

const bindings: WorkflowExecutorBindings = {
  planner: {
    agentId: "claude-agent",
    model: "claude-opus-4-1",
    permissionProfile: "read_only",
  },
  implementer: {
    agentId: "opencode",
    model: "gpt-5",
    permissionProfile: "workspace_write",
  },
  reviewer: {
    agentId: "codex",
    model: "gpt-5",
    permissionProfile: "read_only",
  },
};

class MemoryWorkflowRepository implements WorkflowRepository {
  aggregate: WorkflowAggregate | null = null;

  async listRuns() {
    return this.aggregate ? [structuredClone(this.aggregate.run)] : [];
  }

  async get() {
    return this.aggregate ? structuredClone(this.aggregate) : null;
  }

  async create(aggregate: WorkflowAggregate) {
    this.aggregate = structuredClone(aggregate);
  }

  async commit(aggregate: WorkflowAggregate, expectedRevision: number) {
    if (this.aggregate?.run.revision !== expectedRevision) {
      throw new Error("revision conflict");
    }
    this.aggregate = structuredClone(aggregate);
  }

  async claimNextAction() {
    return null;
  }

  async renewActionLease(): Promise<WorkflowActionRecord | null> {
    return null;
  }

  async settleAction(): Promise<WorkflowActionRecord | null> {
    return null;
  }
}

describe("WorkflowModule", () => {
  it("persists a frozen provider-neutral workflow and its first action", async () => {
    const repository = new MemoryWorkflowRepository();
    let id = 0;
    const module = new WorkflowModule(repository, {
      createId: () => `id-${++id}`,
      now: () => "2026-08-09T00:00:00.000Z",
    });

    const created = await module.create({
      workspaceId: "workspace-1",
      workspaceRootPath: "/tmp/workspace-1",
      prompt: "Implement the feature",
      bindings,
    });
    bindings.planner.agentId = "codex";

    const started = await module.start(created.run.id);

    expect(started.run.frozenBindings.planner.agentId).toBe("claude-agent");
    expect(started.run.frozenBindings.implementer.agentId).toBe("opencode");
    expect(started.run.currentStepId).toBe("plan");
    expect(started.actions).toEqual([
      expect.objectContaining({
        type: "execute_agent_step",
        payload: { role: "planner", stepId: "plan" },
        status: "pending",
      }),
    ]);
  });
});
