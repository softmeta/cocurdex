import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import type { DaemonError } from "./daemon-status.ts";
import type { AgentsRequests, AgentsResults } from "./methods/agents.ts";
import type {
  AutomationRequests,
  AutomationResults,
} from "./methods/automation.ts";
import type { ContentRequests, ContentResults } from "./methods/content.ts";
import type { DaemonRequests, DaemonResults } from "./methods/daemon.ts";
import type { HostRequests, HostResults } from "./methods/host.ts";
import type { SessionsRequests, SessionsResults } from "./methods/sessions.ts";
import type {
  WorkspaceRequests,
  WorkspaceResults,
} from "./methods/workspace.ts";

export type * from "./daemon-status.ts";
export {
  DAEMON_WEBSOCKET_PROTOCOL,
  daemonWebSocketProtocols,
  readDaemonWebSocketToken,
} from "./websocket-protocol.ts";

export const DAEMON_PROTOCOL_VERSION = 32;

export type DaemonRequestPayloadByMethod = DaemonRequests &
  AgentsRequests &
  SessionsRequests &
  WorkspaceRequests &
  ContentRequests &
  AutomationRequests &
  HostRequests;

export type DaemonResultByMethod = DaemonResults &
  AgentsResults &
  SessionsResults &
  WorkspaceResults &
  ContentResults &
  AutomationResults &
  HostResults;

export type DaemonMethod = keyof DaemonRequestPayloadByMethod;

type DaemonNoParamMethod = {
  [M in DaemonMethod]: DaemonRequestPayloadByMethod[M] extends undefined
    ? M
    : never;
}[DaemonMethod];

export const DAEMON_NO_PARAM_METHODS = {
  "agent.list": true,
  "app.bootstrap": true,
  "attention.list": true,
  "daemon.status": true,
  "daemon.health": true,
  "daemon.background.get": true,
  "system.fontFamilies": true,
  "system.homeDir": true,
  "host.identity": true,
  "host.session": true,
  "host.remoteAccess.get": true,
  "host.pairing.list": true,
  "host.devices.list": true,
  "host.devices.revokeSelf": true,
  "host.push.get": true,
  "host.push.unregister": true,
  "host.traffic.get": true,
  "host.traffic.reset": true,
  "issue.listViews": true,
  "issue.listLabels": true,
  "issue.listLinkedSessionIds": true,
  "teamTemplate.list": true,
  "memory.settings.get": true,
  "memory.policy": true,
  "memory.cloud.disconnect": true,
  "memory.cloud.keys": true,
  "memory.revision": true,
  "memory.capabilities": true,
  "scriptRun.settings.get": true,
  "application.list": true,
  "mcp.readConfig": true,
  "mcp.injection.check": true,
  "skills.catalog.sources": true,
  "deck.list": true,
  "link.candidates": true,
  "note.list": true,
  "provider.listConfigs": true,
  "provider.listTemplates": true,
  "provider.titleModel.get": true,
  "codex.account.read": true,
  "codex.logout": true,
  "codex.login.start": true,
  "network.proxy.get": true,
  "agent.runLimits.get": true,
  "git.commitMessageModel.get": true,
  "git.commitMessageModel.resolve": true,
  "provider.listDefaults": true,
  "provider.exportJson": true,
  "agentRole.list": true,
  "personalAgent.list": true,
  "delegation.remote.catalog": true,
  "host.remotes.list": true,
  "inbox.list": true,
  "session.list": true,
  "session.listArchived": true,
  "settings.pendingChanges.list": true,
  "workspace.list": true,
  "worktree.list": true,
  "worktree.settings.get": true,
} as const satisfies Record<DaemonNoParamMethod, true>;

export function daemonMethodHasNoParams(
  method: DaemonMethod,
): method is DaemonNoParamMethod {
  return Object.hasOwn(DAEMON_NO_PARAM_METHODS, method);
}

export type DaemonRequest<M extends DaemonMethod = DaemonMethod> = {
  [Method in DaemonMethod]: DaemonRequestPayloadByMethod[Method] extends undefined
    ? { id: string; method: Method; token: string; idempotencyKey?: string }
    : {
        id: string;
        method: Method;
        params: DaemonRequestPayloadByMethod[Method];
        token: string;
        idempotencyKey?: string;
      };
}[M];

export type DaemonResponse<M extends DaemonMethod = DaemonMethod> = {
  [Method in DaemonMethod]:
    | { id: string; result: DaemonResultByMethod[Method] }
    | { error: DaemonError; id: string };
}[M];

export interface DaemonEventEnvelope {
  event: CocurdexDaemonEvent;
  seq?: number;
  type: "daemon.event";
}

export type DaemonWireMessage =
  | DaemonRequest
  | DaemonResponse
  | DaemonEventEnvelope;
