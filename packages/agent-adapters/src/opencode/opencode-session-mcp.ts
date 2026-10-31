import { randomUUID } from "node:crypto";
import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import { loadInjectedMcpServers } from "../shared/injected-mcp";
import {
  type OpenCodePermissionRule,
  openCodeAgentToolsConfig,
  openCodeSessionServerName,
  openCodeSessionToolRules,
  removeOpenCodeSessionServer,
  syncOpenCodeMcpServers,
  withOpenCodeSessionToolRules,
} from "./opencode-mcp";
import {
  formatOpenCodeError,
  logOpenCode,
  type OpenCodeClient,
} from "./opencode-runtime";

export function createOpenCodeSessionMcp(
  payload: Pick<
    CreateAgentSessionPayload,
    "agentTools" | "resolveMcpServers" | "session"
  >,
) {
  const sessionServerName = payload.agentTools
    ? openCodeSessionServerName(
        `${payload.session.id}-${randomUUID().slice(0, 8)}`,
      )
    : null;
  let syncedDirectory: string | null = null;
  let rulesAppliedTo: string | null = null;

  async function sync(client: OpenCodeClient, directory: string) {
    try {
      await syncOpenCodeMcpServers({
        client,
        directory,
        servers: await loadInjectedMcpServers(payload.resolveMcpServers),
        sessionServer:
          sessionServerName && payload.agentTools
            ? {
                name: sessionServerName,
                config: openCodeAgentToolsConfig(payload.agentTools),
              }
            : null,
      });
      syncedDirectory = directory;
    } catch (error) {
      logOpenCode("warn", "MCP server sync failed", {
        appSessionId: payload.session.id,
        error: formatOpenCodeError(error),
      });
    }
  }

  async function applyRules(
    client: OpenCodeClient,
    openCodeSessionId: string,
    current: readonly OpenCodePermissionRule[] | undefined,
  ) {
    if (rulesAppliedTo === openCodeSessionId) return;
    try {
      await client.session.update({
        sessionID: openCodeSessionId,
        permissions: withOpenCodeSessionToolRules(
          current ?? [],
          sessionServerName,
        ),
      });
      rulesAppliedTo = openCodeSessionId;
    } catch (error) {
      logOpenCode("warn", "Session tool rules update failed", {
        appSessionId: payload.session.id,
        error: formatOpenCodeError(error),
      });
    }
  }

  return {
    createPermissions: () => openCodeSessionToolRules(sessionServerName),
    markRulesApplied(openCodeSessionId: string) {
      rulesAppliedTo = openCodeSessionId;
    },
    applyRules,
    sync,
    dispose(client: OpenCodeClient | null) {
      if (!(client && sessionServerName && syncedDirectory)) return;
      void removeOpenCodeSessionServer(
        client,
        syncedDirectory,
        sessionServerName,
      ).catch(() => undefined);
    },
  };
}
