import { describe, expect, it } from "vitest";
import { validateWorkflowArtifact } from "./artifact-contracts";

describe("workflow artifact contracts", () => {
  it("accepts a versioned Plan Artifact", () => {
    expect(() =>
      validateWorkflowArtifact(
        {
          schemaId: "plan_artifact.v1",
          content: {
            summary: "Implement the workflow foundation",
            steps: ["Plan", "Implement", "Review"],
            acceptanceCriteria: ["All checks pass"],
          },
          contentHash: "sha256:plan",
        },
        "completed",
      ),
    ).not.toThrow();
  });

  it("rejects a Review Decision that disagrees with its transition", () => {
    expect(() =>
      validateWorkflowArtifact(
        {
          schemaId: "review_decision.v1",
          content: { verdict: "accepted" },
          contentHash: "sha256:review",
        },
        "changes_requested",
      ),
    ).toThrow("verdict must match");
  });
});
