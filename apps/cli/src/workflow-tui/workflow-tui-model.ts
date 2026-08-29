import type {
  WorkflowAggregate,
  WorkflowArtifactContent,
  WorkflowArtifactSchemaId,
  WorkflowAttemptStatus,
  WorkflowRunStatus,
  WorkflowStepKind,
  WorkflowStepRunStatus,
  WorkflowSuspensionReason,
} from "@cocurdex/shared";

export interface WorkflowTuiArtifactView {
  schemaId: WorkflowArtifactSchemaId;
  content: WorkflowArtifactContent;
  contentHash: string;
  baselineCommit: string | null;
}

export interface WorkflowTuiStepView {
  stepRunId: string;
  stepId: string;
  kind: WorkflowStepKind;
  role: string | null;
  status: WorkflowStepRunStatus;
  attemptCount: number;
  isCurrent: boolean;
  agentId: string | null;
  model: string | null;
  attemptStatus: WorkflowAttemptStatus | null;
  sessionId: string | null;
  providerSessionId: string | null;
  attemptError: string | null;
  activeSuspensionReason: WorkflowSuspensionReason | null;
  activeSuspensionMessage: string | null;
  artifactSchemaIds: WorkflowArtifactSchemaId[];
  artifacts: WorkflowTuiArtifactView[];
}

export interface WorkflowTuiView {
  runId: string;
  definition: string;
  workspaceRootPath: string;
  prompt: string;
  status: WorkflowRunStatus;
  revision: number;
  currentStepId: string | null;
  updatedAt: string;
  steps: WorkflowTuiStepView[];
  actions: {
    canStart: boolean;
    canApprove: boolean;
    canReject: boolean;
    canCancel: boolean;
  };
}

const TERMINAL_STATUSES = new Set<WorkflowRunStatus>([
  "completed",
  "failed",
  "cancelled",
  "exhausted",
]);

export function projectWorkflowTui(
  aggregate: WorkflowAggregate,
): WorkflowTuiView {
  const stepByDefinitionId = new Map(
    aggregate.steps.map((step) => [step.stepId, step]),
  );
  const attemptsByStepRunId = new Map(
    aggregate.steps.map((step) => [
      step.id,
      aggregate.attempts
        .filter((attempt) => attempt.stepRunId === step.id)
        .sort((left, right) => right.sequence - left.sequence),
    ]),
  );
  const activeSuspensionByStepRunId = new Map(
    aggregate.suspensions
      .filter((suspension) => suspension.status === "active")
      .map((suspension) => [suspension.stepRunId, suspension]),
  );

  const steps = aggregate.run.frozenDefinition.steps.flatMap((definition) => {
    const step = stepByDefinitionId.get(definition.id);
    if (!step) {
      return [];
    }

    const attempts = attemptsByStepRunId.get(step.id) ?? [];
    const latestAttempt = attempts[0];
    const attemptIds = new Set(attempts.map((attempt) => attempt.id));
    const artifacts = aggregate.artifacts
      .filter(
        (artifact) =>
          artifact.producerAttemptId !== null &&
          attemptIds.has(artifact.producerAttemptId),
      )
      .map((artifact) => ({
        schemaId: artifact.schemaId,
        content: artifact.content,
        contentHash: artifact.contentHash,
        baselineCommit: artifact.baselineCommit,
      }));
    const activeSuspension = activeSuspensionByStepRunId.get(step.id);

    return [
      {
        stepRunId: step.id,
        stepId: step.stepId,
        kind: step.kind,
        role: step.role,
        status: step.status,
        attemptCount: step.attemptCount,
        isCurrent: aggregate.run.currentStepId === step.stepId,
        agentId: latestAttempt?.executorBinding.agentId ?? null,
        model: latestAttempt?.executorBinding.model ?? null,
        attemptStatus: latestAttempt?.status ?? null,
        sessionId: latestAttempt?.sessionId ?? null,
        providerSessionId:
          latestAttempt?.runtimeIdentity.providerSessionId ?? null,
        attemptError: latestAttempt?.error ?? null,
        activeSuspensionReason: activeSuspension?.reason ?? null,
        activeSuspensionMessage: activeSuspension?.message ?? null,
        artifactSchemaIds: artifacts.map((artifact) => artifact.schemaId),
        artifacts,
      },
    ];
  });
  const currentStep = steps.find((step) => step.isCurrent);
  const canDecideGate =
    aggregate.run.status === "awaiting_gate" &&
    currentStep?.kind === "gate" &&
    currentStep.status === "awaiting_gate";

  return {
    runId: aggregate.run.id,
    definition: `${aggregate.run.definitionId}@${aggregate.run.definitionVersion}`,
    workspaceRootPath: aggregate.run.workspaceRootPath,
    prompt: aggregate.run.rootPrompt,
    status: aggregate.run.status,
    revision: aggregate.run.revision,
    currentStepId: aggregate.run.currentStepId,
    updatedAt: aggregate.run.updatedAt,
    steps,
    actions: {
      canStart: aggregate.run.status === "created",
      canApprove: canDecideGate,
      canReject: canDecideGate,
      canCancel: !TERMINAL_STATUSES.has(aggregate.run.status),
    },
  };
}
