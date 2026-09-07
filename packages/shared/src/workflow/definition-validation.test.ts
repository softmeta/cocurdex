import { describe, expect, it } from "vitest";
import {
  connectWorkflowTransition,
  removeWorkflowStep,
} from "./definition-edit";
import { workflowDefinitionIssues } from "./definition-validation";
import { PLAN_EXECUTE_REVIEW_DEFINITION } from "./template";

describe("workflowDefinitionIssues", () => {
  it("accepts the built-in plan_execute_review definition", () => {
    expect(workflowDefinitionIssues(PLAN_EXECUTE_REVIEW_DEFINITION)).toEqual(
      [],
    );
  });

  it("rejects a review step that skips validation evidence", () => {
    const skippedValidation = connectWorkflowTransition(
      removeWorkflowStep(PLAN_EXECUTE_REVIEW_DEFINITION, "validate"),
      "implement",
      "completed",
      { type: "step", id: "review" },
    );

    expect(
      workflowDefinitionIssues(skippedValidation).map((issue) => issue.code),
    ).toContain("missing_input");
  });

  it("rejects a rework edge without a traversal limit", () => {
    const unbounded = {
      ...PLAN_EXECUTE_REVIEW_DEFINITION,
      transitions: PLAN_EXECUTE_REVIEW_DEFINITION.transitions.map(
        (transition) =>
          transition.from === "review" &&
          transition.outcome === "changes_requested"
            ? {
                from: "review",
                outcome: "changes_requested" as const,
                to: "implement",
              }
            : transition,
      ),
    };

    expect(
      workflowDefinitionIssues(unbounded).map((issue) => issue.code),
    ).toContain("cycle_unbounded");
  });

  it("rejects an agent step without an instruction", () => {
    const missingInstruction = {
      ...PLAN_EXECUTE_REVIEW_DEFINITION,
      steps: PLAN_EXECUTE_REVIEW_DEFINITION.steps.map((step) =>
        step.id === "plan" ? { ...step, instruction: "" } : step,
      ),
    };

    expect(
      workflowDefinitionIssues(missingInstruction).map((issue) => issue.code),
    ).toContain("agent_missing_instruction");
  });
});
