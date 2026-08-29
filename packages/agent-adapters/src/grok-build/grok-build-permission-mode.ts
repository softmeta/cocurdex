import type { AgentPermissionMode } from "@cocurdex/shared";

// Grok Build takes permission changes as a client-scoped ext notification, not
// an ACP request. Since Cocurdex spawns one Grok process per session, "client
// scope" is effectively session scope here.
//
// See xai-grok-shell agent/mvp_agent/acp_agent.rs `ext_notification` for the
// agent-side mapping, and xai-grok-pager acp_handler/settings.rs for the
// reference client payloads.
export const GROK_PERMISSION_NOTIFICATION_METHOD = "x.ai/yolo_mode_changed";

export function buildGrokPermissionParams(
  mode: AgentPermissionMode,
): Record<string, unknown> | null {
  switch (mode) {
    case "grok-ask":
      return { permission_mode: "ask", yolo_mode: false, auto_mode: false };
    // `yolo_mode` is deliberately omitted: the agent lets yolo win when both
    // are present, which would silently upgrade auto to always-approve.
    case "grok-auto":
      return { permission_mode: "auto", auto_mode: true };
    case "grok-always-approve":
      return { permission_mode: "always-approve", yolo_mode: true };
    default:
      return null;
  }
}
