import crypto from "node:crypto";
import {
  validateWorkflowArtifact,
  type WorkflowAggregate,
  type WorkflowArtifactContent,
  type WorkflowArtifactInput,
  type WorkflowArtifactSchemaId,
  type WorkflowCommand,
  type WorkflowStepDefinition,
  type WorkflowTransitionOutcome,
} from "@cocurdex/shared";

export interface WorkflowAgentContractResult {
  command: Extract<WorkflowCommand, { type: "complete_step" }>;
}

const outputExamples: Record<WorkflowArtifactSchemaId, unknown> = {
  "plan_artifact.v1": {
    summary: "Implementation approach",
    steps: ["First step"],
    acceptanceCriteria: ["Expected behavior"],
  },
  "change_set.v1": {
    summary: "Implemented changes",
    changedFiles: ["path/to/file.ts"],
    workspaceRef: "optional branch, worktree, or commit reference",
  },
  "validation_report.v1": {
    status: "passed",
    checks: [{ name: "typecheck", status: "passed", details: "optional" }],
  },
  "review_decision.v1": {
    verdict: "accepted",
    summary: "Review summary",
    findings: [],
  },
};

function findDefinition(
  aggregate: WorkflowAggregate,
  stepId: string,
): WorkflowStepDefinition & { outputSchema: WorkflowArtifactSchemaId } {
  const definition = aggregate.run.frozenDefinition.steps.find(
    (step) => step.id === stepId,
  );
  if (!definition?.outputSchema) {
    throw new Error(`Workflow step '${stepId}' has no output contract.`);
  }
  return definition as WorkflowStepDefinition & {
    outputSchema: WorkflowArtifactSchemaId;
  };
}

function inputArtifacts(
  aggregate: WorkflowAggregate,
  definition: WorkflowStepDefinition,
) {
  return definition.inputSchemas.map((schemaId) => {
    const artifact = aggregate.artifacts
      .filter((candidate) => candidate.schemaId === schemaId)
      .at(-1);
    if (!artifact) {
      throw new Error(
        `Workflow step '${definition.id}' requires artifact '${schemaId}'.`,
      );
    }
    return {
      schemaId: artifact.schemaId,
      content: artifact.content,
      contentHash: artifact.contentHash,
    };
  });
}

function stepInstruction(stepId: string): string {
  if (stepId === "plan") {
    return "Inspect the workspace and produce an actionable implementation plan. Do not modify files.";
  }
  if (stepId === "implement") {
    return "Implement the approved plan in the workspace and report the resulting change set.";
  }
  if (stepId === "validate") {
    return "Run the relevant repository checks. Report every executed, failed, and intentionally skipped check.";
  }
  if (stepId === "review") {
    return "Review the implementation against the plan and validation evidence. Do not modify files.";
  }
  throw new Error(`Workflow agent step '${stepId}' is unsupported.`);
}

export function buildWorkflowAgentPrompt(
  aggregate: WorkflowAggregate,
  stepId: string,
): string {
  const definition = findDefinition(aggregate, stepId);
  const contract = {
    schemaId: definition.outputSchema,
    content: outputExamples[definition.outputSchema],
  };
  return [
    "You are executing one step in a durable Cocurdex workflow.",
    stepInstruction(stepId),
    "",
    "Workflow objective:",
    aggregate.run.rootPrompt,
    "",
    "Input artifacts:",
    JSON.stringify(inputArtifacts(aggregate, definition), null, 2),
    "",
    "Output contract:",
    JSON.stringify(contract, null, 2),
    "",
    "Return exactly one JSON object matching the content value of the output contract.",
    "Do not wrap it in commentary. A single ```json fenced block is accepted.",
  ].join("\n");
}

function extractJsonObject(output: string): string {
  const trimmed = output.trim();
  const fenced = /^```json\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    throw new Error("Workflow agent must return exactly one JSON object.");
  }
  return candidate;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function contentHash(content: WorkflowArtifactContent): string {
  const canonicalJson = JSON.stringify(canonicalize(content));
  return `sha256:${crypto.createHash("sha256").update(canonicalJson).digest("hex")}`;
}

function outcomeFor(
  schemaId: WorkflowArtifactSchemaId,
  content: WorkflowArtifactContent,
): WorkflowTransitionOutcome {
  if (schemaId === "validation_report.v1") {
    return (
      (content as { status?: WorkflowTransitionOutcome }).status ?? "failed"
    );
  }
  if (schemaId === "review_decision.v1") {
    return (
      (content as { verdict?: WorkflowTransitionOutcome }).verdict ?? "blocked"
    );
  }
  return "completed";
}

export function parseWorkflowAgentOutput(
  aggregate: WorkflowAggregate,
  stepId: string,
  output: string,
): WorkflowAgentContractResult {
  const definition = findDefinition(aggregate, stepId);
  let content: WorkflowArtifactContent;
  try {
    content = JSON.parse(extractJsonObject(output)) as WorkflowArtifactContent;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Workflow agent returned invalid JSON.", {
        cause: error,
      });
    }
    throw error;
  }
  const outcome = outcomeFor(definition.outputSchema, content);
  const artifact = {
    schemaId: definition.outputSchema,
    content,
    contentHash: contentHash(content),
  } as WorkflowArtifactInput;
  validateWorkflowArtifact(artifact, outcome);
  return {
    command: {
      type: "complete_step",
      stepId,
      outcome,
      artifact,
    },
  };
}
