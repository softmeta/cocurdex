import {
  defaultWorkflowCanvasLayout,
  PLAN_EXECUTE_REVIEW_DEFINITION,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { workflowDefinitionToFlow } from "./workflow-definition-graph";

describe("workflowDefinitionToFlow", () => {
  it("projects the built-in definition into nodes and labeled edges", () => {
    const { nodes, edges } = workflowDefinitionToFlow(
      PLAN_EXECUTE_REVIEW_DEFINITION,
      defaultWorkflowCanvasLayout(PLAN_EXECUTE_REVIEW_DEFINITION),
    );

    expect(nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "plan",
        "approve_plan",
        "implement",
        "validate",
        "review",
        "terminal:cancelled",
        "terminal:blocked",
        "terminal:completed",
      ]),
    );
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "plan",
          sourceHandle: "completed",
          target: "approve_plan",
        }),
        expect.objectContaining({
          source: "review",
          sourceHandle: "changes_requested",
          target: "implement",
        }),
      ]),
    );
  });
});
