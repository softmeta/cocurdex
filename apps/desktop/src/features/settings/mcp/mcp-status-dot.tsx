import type { McpServerState } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib";

export type McpDotState = McpServerState | "unknown";

export function McpStatusDot({ state }: { state: McpDotState }) {
  const { t } = useTranslation("settings");
  const label = t(`mcp.state.${state}`);
  return (
    <span
      aria-label={label}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        {
          connected: "bg-status-success",
          "needs-auth": "bg-status-attention",
          failed: "bg-destructive",
          disabled: "bg-muted-foreground/40",
          unknown: "bg-muted-foreground/20",
        }[state],
      )}
      role="img"
      title={label}
    />
  );
}
