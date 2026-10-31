import type { AcpPlanApprovalRequest } from "../acp/acp-agent-adapter";

const GROK_EXIT_PLAN_MODE_METHOD = "x.ai/exit_plan_mode";

// Grok Build parks plan approval on the `x.ai/exit_plan_mode` reverse-request.
// These tool-call titles mark the variants that carry the plan body inline
// instead of writing it to the agent's own `plan.md`; every other title (e.g.
// "Plan: Exit") is file-backed. Mirrors `plan_review_source_for_tool` in
// xai-grok-pager `app/acp_handler/interactions.rs`.
const GROK_INLINE_PLAN_TOOL_TITLES = [
  "CreatePlan",
  "Plan: Submit for approval",
];

// Wire shape per xai-grok-tools `implementations/grok_build/exit_plan_mode/types.rs`:
// the agent serializes camelCase and reads `outcome` back as a bare string.
function parseGrokExitPlanModeParams(params: unknown) {
  const raw = (params ?? {}) as Record<string, unknown>;
  const toolCallId = typeof raw.toolCallId === "string" ? raw.toolCallId : "";
  if (typeof raw.sessionId !== "string" || !raw.sessionId || !toolCallId) {
    throw new Error(
      `${GROK_EXIT_PLAN_MODE_METHOD} requires sessionId and toolCallId`,
    );
  }
  return {
    toolCallId,
    planContent: typeof raw.planContent === "string" ? raw.planContent : null,
  };
}

export const grokBuildPlanApprovalRequest: AcpPlanApprovalRequest = {
  method: GROK_EXIT_PLAN_MODE_METHOD,
  parseParams: parseGrokExitPlanModeParams,
  inlinePlanToolTitles: GROK_INLINE_PLAN_TOOL_TITLES,
};
