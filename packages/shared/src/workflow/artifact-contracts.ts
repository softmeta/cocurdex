import { WorkflowTransitionError } from "./errors";
import type { WorkflowArtifactInput, WorkflowTransitionOutcome } from "./types";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function assertOptionalStringArray(value: unknown, field: string): void {
  if (value !== undefined && !isStringArray(value)) {
    throw new WorkflowTransitionError(
      `Artifact field '${field}' must be a string array.`,
    );
  }
}

export function validateWorkflowArtifact(
  artifact: WorkflowArtifactInput,
  outcome: WorkflowTransitionOutcome,
): void {
  if (!artifact.contentHash.trim()) {
    throw new WorkflowTransitionError(
      "Artifact content hash must not be empty.",
    );
  }

  if (artifact.schemaId === "plan_artifact.v1") {
    if (!artifact.content.summary.trim()) {
      throw new WorkflowTransitionError(
        "Plan Artifact summary must not be empty.",
      );
    }
    assertOptionalStringArray(artifact.content.steps, "steps");
    assertOptionalStringArray(
      artifact.content.acceptanceCriteria,
      "acceptanceCriteria",
    );
    return;
  }

  if (artifact.schemaId === "change_set.v1") {
    if (
      !artifact.content.summary.trim() ||
      !isStringArray(artifact.content.changedFiles)
    ) {
      throw new WorkflowTransitionError(
        "Change Set requires a summary and changedFiles.",
      );
    }
    return;
  }

  if (artifact.schemaId === "validation_report.v1") {
    if (
      artifact.content.status !== outcome ||
      !Array.isArray(artifact.content.checks)
    ) {
      throw new WorkflowTransitionError(
        "Validation Report status must match the step outcome.",
      );
    }
    return;
  }

  if (artifact.content.verdict !== outcome) {
    throw new WorkflowTransitionError(
      "Review Decision verdict must match the step outcome.",
    );
  }
  assertOptionalStringArray(artifact.content.findings, "findings");
}
