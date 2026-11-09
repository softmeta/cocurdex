import type { AgentPermissionMode } from "@cocurdex/shared";

export const GROK_PERMISSION_NOTIFICATION_METHOD = "x.ai/yolo_mode_changed";

export function buildGrokPermissionParams(
  mode: AgentPermissionMode,
): Record<string, unknown> | null {
  switch (mode) {
    case "grok-ask":
      return { permission_mode: "ask", yolo_mode: false, auto_mode: false };
    case "grok-auto":
      return { permission_mode: "auto", auto_mode: true };
    case "grok-always-approve":
      return { permission_mode: "always-approve", yolo_mode: true };
    default:
      return null;
  }
}
