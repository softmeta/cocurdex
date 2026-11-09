import { homedir } from "node:os";
import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import {
  type DaemonRequestContext,
  handleHostRequest,
  isHostRequest,
  LOCAL_REQUEST_CONTEXT,
} from "./host-access";
import { parseDaemonRequest } from "./payloads";
import {
  handleAgentRequest,
  isAgentRequest,
} from "./request-handlers/handle-agent-request";
import {
  handleAutomationRequest,
  isAutomationRequest,
} from "./request-handlers/handle-automation-request";
import {
  handleContentRequest,
  isContentRequest,
} from "./request-handlers/handle-content-request";
import {
  handleWorkspaceRequest,
  isWorkspaceRequest,
} from "./request-handlers/handle-workspace-request";
import type { CocurdexDaemonService } from "./service";
import { handleSessionRequest, isSessionRequest } from "./session-control";
import {
  handleSkillRequest,
  isSkillRequest,
} from "./skills/handle-skill-request";
import {
  listFontFamilies,
  openDirectoryInFileManager,
  revealPathInFileManager,
} from "./system";

export function handleDaemonRequest<M extends DaemonMethod>(
  service: CocurdexDaemonService,
  request: DaemonRequest<M>,
  context?: DaemonRequestContext,
): Promise<DaemonResultByMethod[M]>;
export async function handleDaemonRequest(
  service: CocurdexDaemonService,
  rawRequest: DaemonRequest,
  context: DaemonRequestContext = LOCAL_REQUEST_CONTEXT,
) {
  const request = parseDaemonRequest(rawRequest);
  await service.hostAccessReady;
  if (isHostRequest(request)) {
    return handleHostRequest(service, request, context);
  }
  if (isSkillRequest(request)) {
    return handleSkillRequest(service, request, context);
  }
  await service.acpRegistry.ready;
  if (isSessionRequest(request)) {
    return handleSessionRequest(service, request, context);
  }
  if (isContentRequest(request)) {
    return handleContentRequest(service, request, context);
  }
  if (isWorkspaceRequest(request)) {
    return handleWorkspaceRequest(service, request, context);
  }
  if (isAutomationRequest(request)) {
    return handleAutomationRequest(service, request, context);
  }
  if (isAgentRequest(request)) {
    return handleAgentRequest(service, request, context);
  }
  switch (request.method) {
    case "daemon.status":
      return service.status();
    case "daemon.background.get":
      return service.background.status();
    case "daemon.background.set":
      return service.background.set(request.params.enabled, context.principal);
    case "daemon.shutdownIfIdle":
    case "daemon.health":
    case "daemon.subscribe":
    case "daemon.watchSessions":
    case "diagnostics.export":
    case "diagnostics.logLevel.set":
      throw new Error(
        `${request.method} is intercepted before request dispatch`,
      );
    case "sync.pull":
      return service.pullSync(request.params);
    case "app.bootstrap":
      return service.bootstrap();
    case "network.proxy.test":
      return service.settings.testNetworkProxy(request.params.settings);
    case "network.proxy.get":
      return service.settings.getNetworkProxy();
    case "network.proxy.set":
      return service.settings.setNetworkProxy(request.params.settings);
    case "settings.pendingChanges.list":
      return service.settings.listPendingChanges();
    case "settings.pendingChanges.ack":
      await service.settings.acknowledgeChange(request.params.id);
      return null;
    case "settings.values.report":
      await service.settings.reportValues(request.params.values);
      return null;
    case "system.homeDir":
      return homedir();
    case "system.fontFamilies":
      return listFontFamilies();
    case "system.openDirectory":
      await openDirectoryInFileManager(request.params.path);
      return null;
    case "system.revealPath":
      await revealPathInFileManager(request.params.path);
      return null;
    default: {
      const exhaustive: never = request;
      throw new Error(
        `Unsupported daemon method: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
