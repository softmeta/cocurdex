import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { DaemonRequestContext } from "../host-access/request-context";
import type { CocurdexDaemonService } from "../service";
import { assertLocalPrincipal } from "./principal-guards";

const AUTOMATION_PREFIXES = [
  "agentRole.",
  "application.",
  "delegation.",
  "inbox.",
  "memory.",
  "personalAgent.",
  "routine.",
  "scriptRun.",
  "team.",
  "teamTemplate.",
] as const;

type AutomationMethod = Extract<
  DaemonMethod,
  `${(typeof AUTOMATION_PREFIXES)[number]}${string}`
>;

type MemoryMethod = Extract<AutomationMethod, `memory.${string}`>;

export function isAutomationRequest(
  request: DaemonRequest,
): request is DaemonRequest<AutomationMethod> {
  return AUTOMATION_PREFIXES.some((prefix) =>
    request.method.startsWith(prefix),
  );
}

function isMemoryRequest(
  request: DaemonRequest<AutomationMethod>,
): request is DaemonRequest<MemoryMethod> {
  return request.method.startsWith("memory.");
}

function remoteSender(
  service: CocurdexDaemonService,
  context: DaemonRequestContext,
  requesterName: string,
) {
  const { principal } = context;
  const device =
    principal.kind === "device"
      ? service.hostAccess
          .listDevices()
          .find((candidate) => candidate.id === principal.deviceId)
      : null;
  return {
    hostName: device?.label ?? service.hostAccess.identity().name,
    senderName: requesterName.trim() || "Assistant",
  };
}

export async function handleAutomationRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<AutomationMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[AutomationMethod]> {
  if (isMemoryRequest(request)) {
    return handleMemoryRequest(service, request, context);
  }
  switch (request.method) {
    case "agentRole.list":
      return service.listAgentRoles();
    case "agentRole.get":
      return service.getAgentRole(request.params.id);
    case "agentRole.save":
      return service.saveAgentRole(request.params);
    case "agentRole.delete":
      await service.deleteAgentRole(request.params.id);
      return null;
    case "application.list":
      return service.applications.list();
    case "application.add":
      return service.applications.add(request.params);
    case "application.update":
      return service.applications.update(request.params);
    case "application.remove":
      await service.applications.remove(request.params.id);
      return null;
    case "application.check":
      return service.applications.check(request.params.id);
    case "application.logout":
      return service.applications.logout(request.params.id);
    case "application.login.start":
      return service.applications.startLogin(request.params.id);
    case "application.login.wait":
      return service.applications.waitLogin(
        request.params.id,
        request.params.loginId,
      );
    case "application.login.cancel":
      service.applications.cancelLogin(
        request.params.id,
        request.params.loginId,
      );
      return null;
    case "application.login.return":
      service.applications.submitRedirect(
        request.params.id,
        request.params.loginId,
        request.params.url,
      );
      return null;
    case "application.tools":
      return service.applications.tools(request.params.id);
    case "application.read":
      return service.applications.read(
        request.params.id,
        request.params.tool,
        request.params.args,
      );
    case "application.call":
      return service.applications.call(
        request.params.id,
        request.params.tool,
        request.params.args,
      );
    case "team.get":
      return service.team.get(request.params.leadSessionId);
    case "team.create":
      return service.team.create(request.params);
    case "team.spawn": {
      const { leadSessionId, ...payload } = request.params;
      return service.team.spawn(leadSessionId, payload);
    }
    case "team.stopMember":
      return service.team.stopMember(
        request.params.teamId,
        request.params.sessionId,
      );
    case "team.stop":
      return service.team.stop(request.params.teamId);
    case "team.spawnTemplate": {
      const { leadSessionId, ...payload } = request.params;
      return service.team.spawnTemplate(leadSessionId, payload);
    }
    case "teamTemplate.list":
      return service.team.listTemplates();
    case "teamTemplate.save":
      return service.team.saveTemplate(request.params);
    case "teamTemplate.delete":
      await service.team.deleteTemplate(request.params.id);
      return null;
    case "scriptRun.create":
      return service.scriptRuns.create(request.params);
    case "scriptRun.start":
      return service.scriptRuns.start(request.params);
    case "scriptRun.cancel":
      return service.scriptRuns.cancel(request.params.runId);
    case "scriptRun.get":
      return service.scriptRuns.get(request.params.runId);
    case "scriptRun.list":
      return service.scriptRuns.list(request.params);
    case "scriptRun.settings.get":
      return service.scriptRuns.getSettings();
    case "scriptRun.settings.save":
      return service.scriptRuns.saveSettings(request.params);
    case "personalAgent.list":
      return service.personalAgents.list();
    case "personalAgent.create":
      return service.personalAgents.create(request.params);
    case "personalAgent.greet":
      return service.personalAgents.greet(request.params);
    case "personalAgent.update":
      return service.personalAgents.update(request.params);
    case "personalAgent.duplicate":
      return service.personalAgents.duplicate(request.params);
    case "personalAgent.delete":
      await service.personalAgents.delete(request.params.id);
      return null;
    case "personalAgent.work.catalog":
      return service.delegations.catalog(request.params);
    case "personalAgent.work.list":
      return service.delegations.list(request.params.personaId);
    case "personalAgent.work.start":
      return service.delegations.start(request.params);
    case "personalAgent.work.send":
      return service.delegations.send(request.params);
    case "personalAgent.work.stop":
      return service.delegations.stop(request.params);
    case "delegation.remote.catalog":
      return service.remoteWork.catalog();
    case "delegation.remote.start":
      return service.remoteWork.start(
        request.params,
        remoteSender(service, context, request.params.requesterName),
      );
    case "delegation.remote.status":
      return service.remoteWork.status(request.params.sessionIds);
    case "delegation.remote.send":
      return service.remoteWork.send(
        request.params,
        remoteSender(service, context, request.params.requesterName),
      );
    case "delegation.remote.stop":
      return service.remoteWork.stop(request.params);
    case "inbox.list":
      return service.inbox.list();
    case "inbox.brief":
      return service.inbox.getBrief(request.params.timeZone);
    case "inbox.postBrief":
      return service.inbox.postBrief(request.params);
    case "inbox.read":
      await service.inbox.readItem(request.params.id);
      return null;
    case "routine.list":
      return service.routines.list(request.params.agentId);
    case "routine.get":
      return service.routines.get(request.params.id);
    case "routine.create":
      return service.routines.create(request.params);
    case "routine.update":
      return service.routines.update(request.params);
    case "routine.delete":
      await service.deleteRoutine(request.params.id);
      return null;
    case "routine.run":
      return service.routines.runNow(request.params.id).run;
    case "routine.runs":
      return service.routines.runs(
        request.params.routineId ?? null,
        request.params.limit,
      );
  }
}

async function handleMemoryRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<MemoryMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[MemoryMethod]> {
  const memory = service.memory;
  switch (request.method) {
    case "memory.status":
      return memory.getStatus(request.params.refresh);
    case "memory.settings.get":
      return memory.getSettings();
    case "memory.settings.set":
      return memory.setSettings(request.params.settings);
    case "memory.recall":
      return memory.recall(request.params);
    case "memory.show":
      return memory.show(request.params.id);
    case "memory.remember":
      return memory.remember(request.params);
    case "memory.session.save":
      return memory.saveSession(request.params);
    case "memory.install":
      return memory.install(request.params.force);
    case "memory.doctor":
      return memory.doctor(request.params);
    case "memory.policy":
      return memory.policy();
    case "memory.cloud.connect":
      assertLocalPrincipal(context, request.method);
      return memory.connectCloud(request.params);
    case "memory.cloud.disconnect":
      assertLocalPrincipal(context, request.method);
      return memory.disconnectCloud();
    case "memory.cloud.setSync":
      assertLocalPrincipal(context, request.method);
      return memory.setCloudSync(request.params.enabled);
    case "memory.cloud.keys":
      assertLocalPrincipal(context, request.method);
      return memory.cloudKeys();
    case "memory.list":
      return memory.list(request.params);
    case "memory.update":
      return memory.update(request.params);
    case "memory.forget":
      await memory.forget(request.params.id);
      return null;
    case "memory.restore":
      await memory.restore(request.params.id);
      return null;
    case "memory.history":
      return memory.history(request.params);
    case "memory.revision":
      return memory.revision();
    case "memory.capabilities":
      return memory.capabilities();
    case "memory.export":
      assertLocalPrincipal(context, request.method);
      await memory.exportTo(request.params.file);
      return null;
    case "memory.import":
      assertLocalPrincipal(context, request.method);
      return memory.importFrom(request.params.file);
  }
}
