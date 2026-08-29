import type { AgentMcpServerRuntime } from "@cocurdex/shared";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  CircleSlash2,
  LoaderCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui";

type McpStatusKind =
  | "connected"
  | "connecting"
  | "disabled"
  | "failed"
  | "unknown";

function getMcpStatusKind(status: string): McpStatusKind {
  const normalized = status.toLowerCase();
  if (normalized === "connected" || normalized === "ready") {
    return "connected";
  }
  if (
    normalized === "connecting" ||
    normalized === "pending" ||
    normalized === "starting"
  ) {
    return "connecting";
  }
  if (
    normalized === "disconnected" ||
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("auth")
  ) {
    return "failed";
  }
  if (normalized.includes("disable")) {
    return "disabled";
  }
  return "unknown";
}

function McpStatusIcon({ kind }: { kind: McpStatusKind }) {
  if (kind === "connected") {
    return (
      <CheckCircle2 className="size-3.5 shrink-0 text-chat-status-running-fg" />
    );
  }
  if (kind === "connecting") {
    return (
      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-chat-status-running-fg" />
    );
  }
  if (kind === "failed") {
    return (
      <CircleAlert className="size-3.5 shrink-0 text-chat-status-failed-fg" />
    );
  }
  if (kind === "disabled") {
    return <CircleSlash2 className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <CircleHelp className="size-3.5 shrink-0 text-muted-foreground" />;
}

export function McpRuntimeSubmenu({
  defaultOpen,
  servers,
}: {
  defaultOpen?: boolean;
  servers: readonly AgentMcpServerRuntime[];
}) {
  const { t } = useTranslation("sessions");
  const connectedCount = servers.filter(
    (server) => getMcpStatusKind(server.status) === "connected",
  ).length;
  const summary =
    servers.length > 0
      ? t("modelMenu.mcpSummary", {
          connected: String(connectedCount),
          total: String(servers.length),
        })
      : t("modelMenu.mcpNone");

  return (
    <DropdownMenuSub defaultOpen={defaultOpen}>
      <DropdownMenuSubTrigger>
        <span className="flex-1 truncate">{t("modelMenu.mcp")}</span>
        <span className="max-w-40 truncate text-muted-foreground">
          {summary}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 min-w-64 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("modelMenu.mcpServers")}</DropdownMenuLabel>
          {servers.length === 0 ? (
            <DropdownMenuItem disabled>
              {t("modelMenu.mcpNoneConfigured")}
            </DropdownMenuItem>
          ) : (
            servers.map((server) => {
              const kind = getMcpStatusKind(server.status);
              const statusLabel =
                kind === "unknown"
                  ? server.status
                  : t(`modelMenu.mcpStatuses.${kind}`);
              return (
                <DropdownMenuItem disabled key={server.name}>
                  <McpStatusIcon kind={kind} />
                  <span className="min-w-0 flex-1 truncate">{server.name}</span>
                  <span className="text-muted-foreground">{statusLabel}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
