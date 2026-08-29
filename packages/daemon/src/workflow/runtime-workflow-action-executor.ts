import type {
  WorkflowAttemptRecord,
  WorkflowAttemptRuntimeIdentity,
} from "@cocurdex/shared";
import {
  buildWorkflowAgentPrompt,
  parseWorkflowAgentOutput,
} from "./workflow-agent-contract";
import type {
  WorkflowActionExecutionContext,
  WorkflowActionExecutionResult,
  WorkflowActionExecutor,
} from "./workflow-worker";

export interface WorkflowAgentTurnInput {
  workspaceId: string;
  workspaceRootPath: string;
  stepId: string;
  prompt: string;
  attempt: WorkflowAttemptRecord;
  signal: AbortSignal;
  checkpointAttempt(
    runtimeIdentity: WorkflowAttemptRuntimeIdentity,
    sessionId?: string,
  ): Promise<void>;
}

export interface WorkflowAgentTurnResult {
  content: string;
  providerOperationId: string | null;
}

export interface WorkflowAgentTurnRunner {
  run(input: WorkflowAgentTurnInput): Promise<WorkflowAgentTurnResult>;
}

export class RuntimeWorkflowActionExecutor implements WorkflowActionExecutor {
  constructor(private readonly runner: WorkflowAgentTurnRunner) {}

  async execute(
    context: WorkflowActionExecutionContext,
  ): Promise<WorkflowActionExecutionResult> {
    if (context.action.type !== "execute_agent_step" || !context.attempt) {
      throw new Error(
        `Workflow action '${context.action.id}' is not agent-backed.`,
      );
    }
    const step = context.aggregate.steps.find(
      (candidate) => candidate.id === context.action.stepRunId,
    );
    if (!step) {
      throw new Error(
        `Workflow action '${context.action.id}' has no Step Run.`,
      );
    }

    let latestIdentity = context.attempt.runtimeIdentity;
    let latestSessionId = context.attempt.sessionId ?? undefined;
    const checkpointAttempt = async (
      identity: WorkflowAttemptRuntimeIdentity,
      sessionId?: string,
    ) => {
      latestIdentity = identity;
      latestSessionId = sessionId ?? latestSessionId;
      await context.checkpointAttempt(identity, sessionId);
    };
    const turn = await this.runner.run({
      workspaceId: context.aggregate.run.workspaceId,
      workspaceRootPath: context.aggregate.run.workspaceRootPath,
      stepId: step.stepId,
      prompt: buildWorkflowAgentPrompt(context.aggregate, step.stepId),
      attempt: context.attempt,
      signal: context.signal,
      checkpointAttempt,
    });
    if (turn.providerOperationId) {
      await checkpointAttempt(
        {
          ...latestIdentity,
          providerOperationId: turn.providerOperationId,
        },
        latestSessionId,
      );
    }
    return {
      ...parseWorkflowAgentOutput(context.aggregate, step.stepId, turn.content),
      result: { providerOperationId: turn.providerOperationId },
    };
  }
}
