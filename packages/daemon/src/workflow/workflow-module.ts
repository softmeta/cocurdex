import crypto from "node:crypto";
import type { WorkflowRepository } from "@cocurdex/db";
import {
  type CreateWorkflowPayload,
  createPlanExecuteReviewWorkflow,
  transitionWorkflow,
  type WorkflowAggregate,
  type WorkflowCommand,
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

  async create(payload: CreateWorkflowPayload): Promise<WorkflowAggregate> {
    const aggregate = createPlanExecuteReviewWorkflow(payload, this.context());
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

  private context() {
    return {
      now: this.dependencies.now(),
      createId: this.dependencies.createId,
    };
  }
}
