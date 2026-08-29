import {
  PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  type WorkflowDefinitionRevision,
  type WorkflowExecutorBindings,
  type WorkflowPermissionProfile,
  type WorkflowRole,
} from "./types";

export const PLAN_EXECUTE_REVIEW_DEFINITION: WorkflowDefinitionRevision = {
  definitionId: PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  version: 2,
  steps: [
    {
      id: "plan",
      kind: "agent",
      role: "planner",
      permissionProfile: "read_only",
      inputSchemas: [],
      outputSchema: "plan_artifact.v1",
      maxAttempts: 2,
    },
    {
      id: "approve_plan",
      kind: "gate",
      permissionProfile: "read_only",
      inputSchemas: ["plan_artifact.v1"],
      maxAttempts: 1,
    },
    {
      id: "implement",
      kind: "agent",
      role: "implementer",
      permissionProfile: "workspace_write",
      inputSchemas: ["plan_artifact.v1"],
      outputSchema: "change_set.v1",
      maxAttempts: 3,
    },
    {
      id: "validate",
      kind: "agent",
      role: "implementer",
      permissionProfile: "validation",
      inputSchemas: ["change_set.v1"],
      outputSchema: "validation_report.v1",
      maxAttempts: 2,
    },
    {
      id: "review",
      kind: "agent",
      role: "reviewer",
      permissionProfile: "read_only",
      inputSchemas: [
        "plan_artifact.v1",
        "change_set.v1",
        "validation_report.v1",
      ],
      outputSchema: "review_decision.v1",
      maxAttempts: 2,
    },
  ],
  transitions: [
    { from: "plan", outcome: "completed", to: "approve_plan" },
    { from: "approve_plan", outcome: "approved", to: "implement" },
    {
      from: "approve_plan",
      outcome: "rejected",
      terminalStatus: "cancelled",
    },
    { from: "implement", outcome: "completed", to: "validate" },
    { from: "validate", outcome: "passed", to: "review" },
    { from: "validate", outcome: "failed", terminalStatus: "blocked" },
    { from: "review", outcome: "accepted", terminalStatus: "completed" },
    { from: "review", outcome: "blocked", terminalStatus: "blocked" },
    {
      from: "review",
      outcome: "changes_requested",
      to: "implement",
      maxTraversals: 2,
    },
  ],
};

const requiredProfiles: Record<WorkflowRole, WorkflowPermissionProfile> = {
  planner: "read_only",
  implementer: "workspace_write",
  reviewer: "read_only",
};

export function validatePlanExecuteReviewBindings(
  bindings: WorkflowExecutorBindings,
): void {
  for (const role of Object.keys(requiredProfiles) as WorkflowRole[]) {
    if (bindings[role].permissionProfile !== requiredProfiles[role]) {
      throw new Error(
        `Workflow role '${role}' requires permission profile '${requiredProfiles[role]}'.`,
      );
    }
  }
}
