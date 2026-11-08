import type { AcpPlanApprovalRequest } from "../acp/acp-agent-adapter";

const GROK_EXIT_PLAN_MODE_METHOD = "x.ai/exit_plan_mode";

const GROK_INLINE_PLAN_TOOL_TITLES = [
  "CreatePlan",
  "Plan: Submit for approval",
];

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
