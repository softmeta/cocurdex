import type { McpServerState } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { AppStatusDot, type AppStatusTone } from "@/components";

export type McpDotState = McpServerState | "unknown";

const TONES: Record<McpDotState, AppStatusTone> = {
  connected: "success",
  "needs-auth": "attention",
  failed: "danger",
  disabled: "muted",
  unknown: "faint",
};

export function McpStatusDot({ state }: { state: McpDotState }) {
  const { t } = useTranslation("settings");
  return <AppStatusDot label={t(`mcp.state.${state}`)} tone={TONES[state]} />;
}
