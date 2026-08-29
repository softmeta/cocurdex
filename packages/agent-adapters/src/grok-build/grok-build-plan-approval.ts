// Grok Build parks plan approval on the `x.ai/exit_plan_mode` reverse-request.
// These tool-call titles mark the variants that carry the plan body inline
// instead of writing it to the agent's own `plan.md`; every other title (e.g.
// "Plan: Exit") is file-backed. Mirrors `plan_review_source_for_tool` in
// xai-grok-pager `app/acp_handler/interactions.rs`.
export const GROK_INLINE_PLAN_TOOL_TITLES = [
  "CreatePlan",
  "Plan: Submit for approval",
];
