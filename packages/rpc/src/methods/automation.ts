import type {
  AddApplicationPayload,
  AgentRoleRecord,
  ApplicationConnection,
  ApplicationTool,
  Brief,
  CreatePersonalAgentPayload,
  CreateRoutinePayload,
  CreateScriptRunPayload,
  CreateTeamPayload,
  DelegatedWorkRecord,
  DelegatedWorkTarget,
  DelegationCatalog,
  DelegationCatalogQuery,
  DuplicatePersonalAgentPayload,
  GreetPersonalAgentPayload,
  InboxItem,
  McpLoginOutcome,
  McpLoginStartResult,
  MemoryCloudConnectInput,
  MemoryCloudConnectResult,
  MemoryCloudKeys,
  MemoryDoctorReport,
  MemoryEntry,
  MemoryHistoryEntry,
  MemoryImportResult,
  MemoryInstallResult,
  MemoryListInput,
  MemoryListResult,
  MemoryProviderCapabilities,
  MemoryRecallResult,
  MemoryRememberInput,
  MemoryRememberResult,
  MemorySessionSaveInput,
  MemorySessionSaveResult,
  MemorySettings,
  MemoryStatus,
  MemoryUpdateInput,
  MessageRecord,
  PersonalAgentRecord,
  RemoteWorkSendPayload,
  RemoteWorkStarted,
  RemoteWorkStartPayload,
  RemoteWorkStatus,
  RemoteWorkTarget,
  RoutineRecord,
  RoutineRunRecord,
  SaveAgentRolePayload,
  SaveTeamTemplatePayload,
  ScriptRunRecord,
  ScriptRunSettings,
  ScriptRunSnapshot,
  SendDelegatedWorkPayload,
  SpawnTeammatePayload,
  SpawnTeamTemplatePayload,
  StartDelegatedWorkPayload,
  StartScriptRunPayload,
  SupportedLocale,
  TeamMemberRecord,
  TeamRecord,
  TeamSnapshot,
  TeamTemplateRecord,
  UpdateApplicationPayload,
  UpdatePersonalAgentPayload,
  UpdateRoutinePayload,
} from "@cocurdex/shared";

export type AutomationRequests = {
  "team.get": { leadSessionId: string };
  "team.create": CreateTeamPayload;
  "team.spawn": { leadSessionId: string } & SpawnTeammatePayload;
  "team.stopMember": { teamId: string; sessionId: string };
  "team.stop": { teamId: string };
  "team.spawnTemplate": { leadSessionId: string } & SpawnTeamTemplatePayload;
  "teamTemplate.list": undefined;
  "teamTemplate.save": SaveTeamTemplatePayload;
  "teamTemplate.delete": { id: string };
  "scriptRun.create": CreateScriptRunPayload;
  "scriptRun.start": StartScriptRunPayload;
  "scriptRun.cancel": { runId: string };
  "scriptRun.get": { runId: string };
  "scriptRun.list": { workspaceId?: string; requesterSessionId?: string };
  "scriptRun.settings.get": undefined;
  "scriptRun.settings.save": ScriptRunSettings;
  "memory.status": { refresh?: boolean };
  "memory.settings.get": undefined;
  "memory.settings.set": { settings: MemorySettings };
  "memory.recall": {
    query: string;
    limit?: number;
    project?: string | null;
  };
  "memory.show": { id: string };
  "memory.remember": MemoryRememberInput;
  "memory.session.save": MemorySessionSaveInput;
  "memory.install": { force?: boolean };
  "memory.doctor": { remote?: boolean; checkUpdate?: boolean };
  "memory.policy": undefined;
  "memory.cloud.connect": MemoryCloudConnectInput;
  "memory.cloud.disconnect": undefined;
  "memory.cloud.setSync": { enabled: boolean };
  "memory.cloud.keys": undefined;
  "memory.list": MemoryListInput;
  "memory.update": MemoryUpdateInput;
  "memory.forget": { id: string };
  "memory.restore": { id: string };
  "memory.history": { id?: string | null; limit?: number };
  "memory.revision": undefined;
  "memory.capabilities": undefined;
  "memory.export": { file: string };
  "memory.import": { file: string };
  "application.list": undefined;
  "application.add": AddApplicationPayload;
  "application.update": UpdateApplicationPayload;
  "application.remove": { id: string };
  "application.check": { id: string };
  "application.logout": { id: string };
  "application.login.start": { id: string };
  "application.login.wait": { id: string; loginId: string };
  "application.login.cancel": { id: string; loginId: string };
  "application.login.return": { id: string; loginId: string; url: string };
  "application.tools": { id: string };
  "application.read": {
    id: string;
    tool: string;
    args: Record<string, unknown>;
  };
  "application.call": {
    id: string;
    tool: string;
    args: Record<string, unknown>;
  };
  "agentRole.list": undefined;
  "agentRole.get": { id: string };
  "agentRole.save": SaveAgentRolePayload;
  "agentRole.delete": { id: string };
  "personalAgent.list": undefined;
  "personalAgent.create": CreatePersonalAgentPayload;
  "personalAgent.greet": GreetPersonalAgentPayload;
  "personalAgent.update": UpdatePersonalAgentPayload;
  "personalAgent.duplicate": DuplicatePersonalAgentPayload;
  "personalAgent.delete": { id: string };
  "personalAgent.work.catalog": DelegationCatalogQuery;
  "personalAgent.work.list": { personaId: string };
  "personalAgent.work.start": StartDelegatedWorkPayload;
  "personalAgent.work.send": SendDelegatedWorkPayload;
  "personalAgent.work.stop": DelegatedWorkTarget;
  "delegation.remote.catalog": undefined;
  "delegation.remote.start": RemoteWorkStartPayload;
  "delegation.remote.status": { sessionIds: string[] };
  "delegation.remote.send": RemoteWorkSendPayload;
  "delegation.remote.stop": RemoteWorkTarget;
  "inbox.list": undefined;
  "inbox.read": { id: string };
  "inbox.brief": { timeZone?: string | null };
  "inbox.postBrief": {
    timeZone?: string | null;
    locale?: SupportedLocale | null;
  };
  "routine.list": { agentId?: string | null };
  "routine.get": { id: string };
  "routine.create": CreateRoutinePayload;
  "routine.update": UpdateRoutinePayload;
  "routine.delete": { id: string };
  "routine.run": { id: string };
  "routine.runs": { routineId?: string | null; limit?: number };
};

export type AutomationResults = {
  "team.get": TeamSnapshot | null;
  "team.create": TeamRecord;
  "team.spawn": TeamMemberRecord;
  "team.stopMember": TeamMemberRecord;
  "team.stop": TeamRecord;
  "team.spawnTemplate": TeamMemberRecord[];
  "teamTemplate.list": TeamTemplateRecord[];
  "teamTemplate.save": TeamTemplateRecord;
  "teamTemplate.delete": null;
  "scriptRun.create": ScriptRunRecord;
  "scriptRun.start": ScriptRunRecord;
  "scriptRun.cancel": ScriptRunRecord;
  "scriptRun.get": ScriptRunSnapshot;
  "scriptRun.list": ScriptRunRecord[];
  "scriptRun.settings.get": ScriptRunSettings;
  "scriptRun.settings.save": ScriptRunSettings;
  "memory.status": MemoryStatus;
  "memory.settings.get": MemorySettings;
  "memory.settings.set": MemorySettings;
  "memory.recall": MemoryRecallResult;
  "memory.show": MemoryEntry | null;
  "memory.remember": MemoryRememberResult;
  "memory.session.save": MemorySessionSaveResult;
  "memory.install": MemoryInstallResult;
  "memory.doctor": MemoryDoctorReport;
  "memory.policy": string;
  "memory.cloud.connect": MemoryCloudConnectResult;
  "memory.cloud.disconnect": MemoryStatus;
  "memory.cloud.setSync": MemoryStatus;
  "memory.cloud.keys": MemoryCloudKeys;
  "memory.list": MemoryListResult;
  "memory.update": MemoryEntry | null;
  "memory.forget": null;
  "memory.restore": null;
  "memory.history": MemoryHistoryEntry[];
  "memory.revision": string | null;
  "memory.capabilities": MemoryProviderCapabilities | null;
  "memory.export": null;
  "memory.import": MemoryImportResult;
  "application.list": ApplicationConnection[];
  "application.add": ApplicationConnection;
  "application.update": ApplicationConnection;
  "application.remove": null;
  "application.check": ApplicationConnection;
  "application.logout": ApplicationConnection;
  "application.login.start": McpLoginStartResult;
  "application.login.wait": McpLoginOutcome;
  "application.login.cancel": null;
  "application.login.return": null;
  "application.tools": ApplicationTool[];
  "application.read": unknown;
  "application.call": unknown;
  "agentRole.list": AgentRoleRecord[];
  "agentRole.get": AgentRoleRecord | null;
  "agentRole.save": AgentRoleRecord;
  "agentRole.delete": null;
  "personalAgent.list": PersonalAgentRecord[];
  "personalAgent.create": PersonalAgentRecord;
  "personalAgent.greet": boolean;
  "personalAgent.update": PersonalAgentRecord;
  "personalAgent.duplicate": PersonalAgentRecord;
  "personalAgent.delete": null;
  "personalAgent.work.catalog": DelegationCatalog;
  "personalAgent.work.list": DelegatedWorkRecord[];
  "personalAgent.work.start": DelegatedWorkRecord;
  "personalAgent.work.send": DelegatedWorkRecord;
  "personalAgent.work.stop": DelegatedWorkRecord;
  "delegation.remote.catalog": DelegationCatalog;
  "delegation.remote.start": RemoteWorkStarted;
  "delegation.remote.status": RemoteWorkStatus[];
  "delegation.remote.send": RemoteWorkStatus;
  "delegation.remote.stop": RemoteWorkStatus;
  "inbox.list": InboxItem[];
  "inbox.read": null;
  "inbox.brief": Brief | null;
  "inbox.postBrief": MessageRecord | null;
  "routine.list": RoutineRecord[];
  "routine.get": RoutineRecord | null;
  "routine.create": RoutineRecord;
  "routine.update": RoutineRecord;
  "routine.delete": null;
  "routine.run": RoutineRunRecord;
  "routine.runs": RoutineRunRecord[];
};
