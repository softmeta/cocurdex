import crypto from "node:crypto";
import type { WorkflowRepository } from "@cocurdex/db";
import {
  assertValidWorkflowDefinition,
  builtinPlanExecuteReviewRecord,
  type CreateWorkflowPayload,
  createWorkflowFromDefinition,
  PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  type SaveWorkflowDefinitionPayload,
  transitionWorkflow,
  type WorkflowAggregate,
  type WorkflowCommand,
  type WorkflowDefinitionRecord,
  type WorkflowGateDecisionRecord,
} from "@cocurdex/shared";

export interface WorkflowModuleDependencies {
  createId(): string;
  now(): string;
}

const defaultDependencies: WorkflowModuleDependencies = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

export interface DecideWorkflowGateInput {
  workflowRunId: string;
  stepId: string;
  decision: WorkflowGateDecisionRecord["decision"];
  actor?: WorkflowGateDecisionRecord["actor"];
  reason?: string;
}

export class WorkflowModule {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly dependencies: WorkflowModuleDependencies = defaultDependencies,
  ) {}

  listRuns() {
    return this.repository.listRuns();
  }

  get(runId: string) {
    return this.repository.get(runId);
  }

  async listDefinitions(): Promise<WorkflowDefinitionRecord[]> {
    await this.ensureBuiltinDefinition();
    return this.repository.listDefinitions();
  }

  async getDefinition(id: string): Promise<WorkflowDefinitionRecord | null> {
    await this.ensureBuiltinDefinition();
    return this.repository.getDefinition(id);
  }

  async saveDefinition(
    payload: SaveWorkflowDefinitionPayload,
  ): Promise<WorkflowDefinitionRecord> {
    await this.ensureBuiltinDefinition();
    const existing = await this.repository.getDefinition(payload.id);
    if (existing?.builtin) {
      throw new Error("The built-in workflow definition cannot be edited.");
    }
    const name = payload.name.trim();
    if (!name) {
      throw new Error("Workflow name must not be empty.");
    }
    const revision = {
      ...payload.revision,
      definitionId: payload.id,
    };
    assertValidWorkflowDefinition(revision);
    const now = this.dependencies.now();
    const record: WorkflowDefinitionRecord = {
      id: payload.id,
      name,
      builtin: false,
      revision,
      layout: payload.layout,
      defaultBindings: payload.defaultBindings,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repository.putDefinition(record);
    return record;
  }

  async duplicateDefinition(id: string): Promise<WorkflowDefinitionRecord> {
    await this.ensureBuiltinDefinition();
    const source = await this.repository.getDefinition(id);
    if (!source) {
      throw new Error(`Workflow definition '${id}' was not found.`);
    }
    const now = this.dependencies.now();
    const nextId = this.dependencies.createId();
    const record: WorkflowDefinitionRecord = {
      id: nextId,
      name: `${source.name} copy`,
      builtin: false,
      revision: {
        ...structuredClone(source.revision),
        definitionId: nextId,
        version: 1,
      },
      layout: structuredClone(source.layout),
      defaultBindings: source.defaultBindings
        ? structuredClone(source.defaultBindings)
        : null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.putDefinition(record);
    return record;
  }

  async deleteDefinition(id: string): Promise<void> {
    await this.ensureBuiltinDefinition();
    const existing = await this.repository.getDefinition(id);
    if (!existing) {
      return;
    }
    if (existing.builtin) {
      throw new Error("The built-in workflow definition cannot be deleted.");
    }
    await this.repository.deleteDefinition(id);
  }

  async create(payload: CreateWorkflowPayload): Promise<WorkflowAggregate> {
    await this.ensureBuiltinDefinition();
    const definitionId =
      payload.definitionId ?? PLAN_EXECUTE_REVIEW_WORKFLOW_ID;
    const record = await this.repository.getDefinition(definitionId);
    if (!record) {
      throw new Error(`Workflow definition '${definitionId}' was not found.`);
    }
    const bindings = payload.bindings ?? record.defaultBindings;
    if (!bindings) {
      throw new Error("Workflow executor bindings are required.");
    }
    const aggregate = createWorkflowFromDefinition(
      { ...payload, bindings },
      record.revision,
      this.context(),
    );
    await this.repository.create(aggregate);
    return aggregate;
  }

  start(runId: string) {
    return this.applyCommand(runId, { type: "start" });
  }

  decideGate(input: DecideWorkflowGateInput) {
    return this.applyCommand(input.workflowRunId, {
      type: "decide_gate",
      stepId: input.stepId,
      decision: input.decision,
      actor: input.actor ?? "user",
      reason: input.reason,
    });
  }

  cancel(runId: string) {
    return this.applyCommand(runId, { type: "cancel" });
  }

  async applyCommand(
    runId: string,
    command: WorkflowCommand,
  ): Promise<WorkflowAggregate> {
    const current = await this.repository.get(runId);
    if (!current) {
      throw new Error(`Workflow run '${runId}' was not found.`);
    }

    const result = transitionWorkflow(current, command, this.context());
    await this.repository.commit(result.aggregate, current.run.revision);
    return result.aggregate;
  }

  private async ensureBuiltinDefinition() {
    const existing = await this.repository.getDefinition(
      PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
    );
    const builtin = builtinPlanExecuteReviewRecord(this.dependencies.now());
    if (!existing) {
      await this.repository.putDefinition(builtin);
      return;
    }
    if (
      existing.builtin &&
      existing.revision.version < builtin.revision.version
    ) {
      await this.repository.putDefinition({
        ...existing,
        revision: builtin.revision,
        layout:
          Object.keys(existing.layout.nodes).length > 0
            ? existing.layout
            : builtin.layout,
        updatedAt: builtin.updatedAt,
      });
    }
  }

  private context() {
    return {
      now: this.dependencies.now(),
      createId: this.dependencies.createId,
    };
  }
}
