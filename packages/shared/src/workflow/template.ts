import { defaultWorkflowCanvasLayout } from "./definition-graph";
import {
  PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionRevision,
  type WorkflowExecutorBindings,
  type WorkflowPermissionProfile,
  type WorkflowRole,
} from "./types";

export const PLAN_EXECUTE_REVIEW_DEFINITION: WorkflowDefinitionRevision = {
  definitionId: PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  version: 3,
  initialStepId: "plan",
  steps: [
    {
      id: "plan",
      kind: "agent",
      role: "planner",
      permissionProfile: "read_only",
      instruction:
        "Inspect the workspace and produce an actionable implementation plan. Do not modify files.",
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
      instruction:
        "Implement the approved plan in the workspace and report the resulting change set.",
      inputSchemas: ["plan_artifact.v1"],
      outputSchema: "change_set.v1",
      maxAttempts: 3,
    },
    {
      id: "validate",
      kind: "agent",
      role: "implementer",
      permissionProfile: "validation",
      instruction:
        "Run the relevant repository checks. Report every executed, failed, and intentionally skipped check.",
      inputSchemas: ["change_set.v1"],
      outputSchema: "validation_report.v1",
      maxAttempts: 2,
    },
    {
      id: "review",
      kind: "agent",
      role: "reviewer",
      permissionProfile: "read_only",
      instruction:
        "Review the implementation against the plan and validation evidence. Do not modify files.",
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

export function builtinPlanExecuteReviewRecord(
  now: string,
): WorkflowDefinitionRecord {
  return {
    id: PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
    name: "Plan, execute, review",
    builtin: true,
    revision: PLAN_EXECUTE_REVIEW_DEFINITION,
    layout: defaultWorkflowCanvasLayout(PLAN_EXECUTE_REVIEW_DEFINITION),
    defaultBindings: null,
    createdAt: now,
    updatedAt: now,
  };
}

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
