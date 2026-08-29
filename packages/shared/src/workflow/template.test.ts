import { describe, expect, it } from "vitest";
import { PLAN_EXECUTE_REVIEW_DEFINITION } from "./template";

describe("plan_execute_review definition", () => {
  it("runs validation as a restricted attempt of the implementer", () => {
    expect(
      PLAN_EXECUTE_REVIEW_DEFINITION.steps.find(
        (step) => step.id === "validate",
      ),
    ).toMatchObject({
      kind: "agent",
      role: "implementer",
      permissionProfile: "validation",
      outputSchema: "validation_report.v1",
    });
  });
});
