import { EventEmitter } from "node:events";
import os, { homedir } from "node:os";
import { deleteAgentProviderSession } from "@cocurdex/agent-adapters";
import { loginPiProvider } from "@cocurdex/agent-adapters/provider-auth";
import { AgentSteeringUnavailableError } from "@cocurdex/agent-core";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type {
  AgentEvent,
  AgentId,
  AgentPlanApprovalDecision,
  AgentRoleRecord,
  AgentRuntimeProviderConfig,
  AppBootstrapData,
  ArchiveSessionsResult,
  CocurdexDaemonEvent,
  ContextTransferRecord,
  CreateSessionPayload,
  ForkSessionPayload,
  GetToolCallResultInput,
  MessageRecord,
  QueuedAgentInputRecord,
  RefineSessionTitlePayload,
  RoutineRunRecord,
  SaveAgentRolePayload,
  SendSessionCommand,
  SessionConfiguration,
  SessionRecord,
  SetSessionPinnedPayload,
  SyncPullInput,
  SyncPullResult,
  TurnChangeDiffRequest,
  TurnChangeFileContentRequest,
  UndoTurnChangesInput,
  UpdateSessionAttentionPayload,
  UpdateSessionRuntimePayload,
  UpdateSessionTitlePayload,
} from "@cocurdex/shared";
import {
  assertPersonalAgentRuntime,
  buildContextHandoffText,
  buildPolicy,
  CHAT_WORKSPACE_ID,
  contextHandoffBudget,
  type HostPrincipal,
  isAgentEvent,
  isAgentId,
  isChatSession,
  isChatWorkspaceId,
  isFeatureEnabled,
  isHandoffVisibleMessage,
  isPersonalSession,
  isPersonalWorkspaceId,
  isSessionRuntimeEvent,
  isToolCallId,
  messageAgentLookup,
  normalizeAgentRoleAvatar,
  normalizeAgentRoleDescription,
  normalizeAgentRoleName,
  normalizeWorkspaceRootPaths,
  PERSONAL_AGENT_RUNTIME_ID,
  PERSONAL_WORKSPACE_ID,
  primaryWorkspaceRootPath,
  principalHasScope,
  resolveSessionWorkingPath,
  resolveStartContext,
  toolMayMutateWorkspace,
  validateSendSessionCommand,
  validateSessionConfiguration,
  validateSessionId,
} from "@cocurdex/shared";
import { AcpRegistryService, AgentAuthService } from "./acp-registry";
import {
  AgentToolBridge,
  registerAssistantTools,
  registerHistoryTools,
  registerMemoryTools,
  registerMessagingTools,
  registerRoutineTools,
  registerScriptRunTools,
  registerSettingsTools,
  registerTeamTools,
  registerWorkTools,
} from "./agent-tools";
import { registerApplicationTools } from "./agent-tools/groups/applications";
import { AgentCatalog } from "./agents";
import { resolveApplicationPrincipal } from "./application-principal";
import { ApplicationService } from "./application-service";
import { AssistantSessions } from "./assistant/assistant-sessions";
import { DaemonAttachmentStore } from "./attachment-store";
import { DaemonBackgroundService, type DaemonRuntime } from "./background";
import { DaemonCommitMessageService } from "./commit-message";
import { DaemonSettingsService } from "./daemon-settings";
import { DaemonDataService } from "./data-service";
import { DaemonDeckService, DeckAssetStore } from "./decks";
import {
  DelegationModule,
  pendingInteractionKind,
  RemoteWorkHost,
  WorkReports,
} from "./delegation";
import { logDaemonDiagnostic } from "./diagnostics";
import { loadExecutionTree } from "./execution-tree";
import {
  createTrafficMeter,
  HostAccessService,
  LOCAL_REQUEST_CONTEXT,
  listHostAddresses,
  type TrafficMeter,
} from "./host-access";
import {
  createHostKeyStore,
  daemonNoiseCrypto,
  type HostKeyStore,
} from "./host-access/host-key-store";
import { InboxService } from "./inbox/inbox-service";
import { DaemonMcpService } from "./mcp-service";
import { MemoryService } from "./memory";
import { OutboxService, routineRunAlert } from "./outbox";
import { getDefaultUserDataPath } from "./paths";
import { DaemonPdfAnnotationsService } from "./pdf-annotations";
import { PeerMessagingService } from "./peer-messaging";
import {
  isPostedMessage,
  PersonalAgentService,
  personaGreetingPrompt,
  personaMemoryScope,
  personaRoleFromHomeThread,
  personaSystemSections,
  personaWritePartition,
  postedMessagesSinceReply,
} from "./personal";
import { DaemonProviderService } from "./provider";
import { withServerProviderConnection } from "./provider/server-connection";
import {
  generateProviderSessionTitle,
  generateSessionText,
} from "./provider/session-title";
import {
  createCredentialVault,
  headlessCredentialStore,
  ProviderCredentials,
  ProviderLoginSessions,
} from "./provider-credentials";
import { PushService, type PushTrigger, pushTriggerForEvent } from "./push";
import {
  createRemoteHostStore,
  RemoteHosts,
  remoteWorkGateway,
} from "./remote-hosts";
import {
  createRoutineSessions,
  ROUTINE_RUN_SECTION,
  RoutineService,
  routineRunPolicy,
  routineRunSection,
} from "./routines";
import { SLOW_REQUEST_THRESHOLD_MS } from "./rpc-request-log";
import { AgentRuntimeManager, type RuntimePersistence } from "./runtime";
import { ScriptRunModule } from "./script-run";
import { DaemonSearchService } from "./search-service";
import {
  applySessionConfiguration,
  collectHandoffItems,
  decideDelivery,
  dispatchSessionTurn,
  forkProviderThreads,
  loadDispatchHistory,
  RunCapacity,
  readSessionActivity,
  resolveForkPoint,
  resolveRepeatedSend,
  type SessionActivityReader,
  SessionCommandQueue,
  type SessionExecutionContext,
  SessionFollowUpQueue,
  SessionRunCoordinator,
  type SessionRuntimeMessage,
  type SessionTurnOutcome,
  selectArchivableRoots,
} from "./session-control";
import {
  type NewSessionContext,
  resolveNewSession,
  resolveNewSessionDefaults,
} from "./session-control/create-session";
import { SessionRuntimeStates } from "./session-control/runtime-states";
import { resolveRuntimeUpdate } from "./session-control/update-runtime";
import { DaemonSkillLibraryService } from "./skills";
import { DaemonSkillsService } from "./skills-service";
import { DaemonState } from "./state";
import { pullSync } from "./sync/sync-pull";
import { createKeepAwake } from "./system";
import { TeamModule, type TeammateReportCommand } from "./team";
import { TerminalService } from "./terminal";
import {
  createWorkspaceChangeCoordinator,
  type WorkspaceChangeCoordinator,
} from "./workspace-changes";
import { WorkspaceHost, withMissingRootPaths } from "./workspace-host";
import { WorktreeLifecycle } from "./worktree-lifecycle";

export interface CocurdexDaemonServiceOptions {
  runtimeFingerprint: string;
  socketPath?: string;
  startedAt?: string;
  userDataPath: string;
  agentToolsUrl?: string;
  localToken?: string;
  autoStartMemory?: boolean;
  runtime?: DaemonRuntime;
}

export interface CocurdexDaemonStatus {
  hostId: string;
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const CHECKPOINT_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class CocurdexDaemonService {
  readonly events = new EventEmitter();
  readonly agents: AgentCatalog;
  readonly agentTools: AgentToolBridge;
  readonly peerMessaging: PeerMessagingService;
  readonly team: TeamModule;
  readonly delegations: DelegationModule;
  readonly remoteHosts: RemoteHosts;
  readonly remoteWork: RemoteWorkHost;
  readonly scriptRuns: ScriptRunModule;
  readonly dataService: DaemonDataService;
  readonly decks: DaemonDeckService;
  readonly personalAgents: PersonalAgentService;
  readonly routines: RoutineService;
  readonly inbox: InboxService;
  readonly assistant: AssistantSessions;
  private readonly outbox: OutboxService;
  readonly providerService: DaemonProviderService;
  readonly acpRegistry: AcpRegistryService;
  readonly agentAuth: AgentAuthService;
  readonly providerCredentials: ProviderCredentials;
  readonly providerLogins: ProviderLoginSessions;
  private startupRecovery: Promise<void> | null = null;
  private stopping = false;
  readonly commitMessageService: DaemonCommitMessageService;
  readonly memory: MemoryService;
  readonly mcp: DaemonMcpService;
  readonly applications: ApplicationService;
  readonly pdfAnnotationsService: DaemonPdfAnnotationsService;
  readonly attachments: DaemonAttachmentStore;
  readonly workspaces: WorkspaceHost;
  readonly settings: DaemonSettingsService;
  readonly runtime: AgentRuntimeManager;
  readonly searchService: DaemonSearchService;
  readonly terminals: TerminalService;
  readonly skillsService: DaemonSkillsService;
  readonly skillLibrary: DaemonSkillLibraryService;
  readonly state: DaemonState;
  readonly hostAccess: HostAccessService;
  readonly push: PushService;
  readonly background: DaemonBackgroundService;
  private readonly keepAwake = createKeepAwake({
    platform: process.platform,
    pid: process.pid,
    onError: (error) =>
      logDaemonDiagnostic("warn", "daemon.keepAwakeFailed", { error }),
  });
  private keepAwakeSync: Promise<void> = Promise.resolve();
  readonly remoteTraffic: TrafficMeter = createTrafficMeter();
  readonly hostAccessReady: Promise<void>;
  readonly workspaceChanges: WorkspaceChangeCoordinator;
  private readonly runtimeFingerprint: string;
  private readonly socketPath: string;
  private readonly startedAt: string;
  private readonly userDataPath: string;
  readonly hostKeys: HostKeyStore;
  private readonly sessionCommands = new SessionCommandQueue();
  readonly runs: SessionRunCoordinator;
  readonly worktrees: WorktreeLifecycle;
  private readonly queuedFollowUps: SessionFollowUpQueue;
  private readonly sessionRuntimeStates = new SessionRuntimeStates();
  private readonly runCapacity: RunCapacity;
  private shutdownPromise: Promise<void> | null = null;
  private readonly checkpointReconcileTimer: NodeJS.Timeout;

  constructor(options: CocurdexDaemonServiceOptions) {
    this.runtimeFingerprint = options.runtimeFingerprint;
    this.socketPath = options.socketPath ?? "";
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.userDataPath = options.userDataPath;
    this.state = new DaemonState(options.userDataPath);
    this.inbox = new InboxService({
      state: this.state,
      runtime: {
        getPendingInteractions: () => this.runtime.getPendingInteractions(),
      },
      routines: () => this.routines,
      announceSessionsChanged: () => this.announceSessionsChanged(),
    });
    this.assistant = new AssistantSessions({
      state: this.state,
      agents: {
        readDisabledAgentIds: () => this.agents.readDisabledAgentIds(),
        detectAgents: () => this.agents.detectAgents(),
      },
      saveSessionConfiguration: (configuration) =>
        this.saveSessionConfiguration(configuration),
      announceSessionsChanged: () => this.announceSessionsChanged(),
    });
    this.queuedFollowUps = new SessionFollowUpQueue(this.state);
    this.hostKeys = createHostKeyStore(options.userDataPath);
    this.hostAccess = new HostAccessService({
      localToken: options.localToken ?? crypto.randomUUID(),
      hostKey: () => this.hostKeys.keys().noisePublicKey,
      repository: this.state.hostAccessStore.repository,
      settings: this.state.hostAccessStore.settings,
      hostName: () => os.hostname(),
      listAddresses: (port) => listHostAddresses(os.networkInterfaces(), port),
      remoteAccessAllowed: isFeatureEnabled(buildPolicy, "remote-access"),
      onRemoteAccessChanged: () => {
        this.settings.announceChanged();
        this.syncKeepAwake();
      },
    });
    this.hostAccessReady = this.hostAccess.initialize();
    this.remoteHosts = new RemoteHosts({
      store: createRemoteHostStore(options.userDataPath),
      crypto: daemonNoiseCrypto,
      deviceLabel: () => os.hostname(),
    });
    this.remoteHosts.onChanged(() => this.settings.announceChanged());
    this.push = new PushService({
      repository: this.state.hostAccessStore.repository,
      settings: this.state.hostAccessStore.settings,
      signingKey: () => this.hostKeys.keys().signingPrivateKey,
      identity: () => this.hostAccess.identity(),
      crypto: daemonNoiseCrypto,
    });
    const runtime = options.runtime ?? { kind: "source" };
    this.background = new DaemonBackgroundService({
      settings: this.state.hostAccessStore.settings,
      target:
        runtime.kind !== "source"
          ? {
              platform: process.platform,
              runtime: runtime.kind,
              launchCommand: runtime.launchCommand,
              userDataPath: options.userDataPath,
              defaultUserDataPath: getDefaultUserDataPath(),
              homeDir: homedir(),
              xdgConfigHome: process.env.XDG_CONFIG_HOME,
            }
          : null,
    });
    this.dataService = new DaemonDataService(this.state, this.events);
    this.decks = new DaemonDeckService(
      this.state.data.decks,
      this.events,
      DeckAssetStore.open(options.userDataPath),
    );
    this.personalAgents = new PersonalAgentService({
      repository: this.state.data.personalAgents,
      getRole: (id) => this.state.getAgentRole(id),
      saveRole: (payload) => this.saveAgentRole(payload),
      deleteRole: (id) => this.state.deleteAgentRole(id),
      createHomeSession: (role) =>
        this.createSession({
          workspaceId: PERSONAL_WORKSPACE_ID,
          agentRoleId: role.id,
          title: role.name,
        }),
      removeSession: (sessionId) => this.removeSession(sessionId),
      listModels: () =>
        this.providerService.listCompatibleProviderModels(
          PERSONAL_AGENT_RUNTIME_ID,
        ),
      hasMessages: async (sessionId) =>
        (await this.state.listMessagesBySessionId(sessionId)).length > 0,
      writeGreeting: async (sessionId, input) => {
        const session = await this.state.getSession(sessionId);
        if (!session) return null;
        return generateSessionText(
          {
            state: this.state,
            readApiKey: (providerId) =>
              this.providerCredentials.readApiKey(providerId),
            resolveSessionProvider: (target) =>
              this.providerCredentials.forSession(target),
          },
          session,
          personaGreetingPrompt(input),
        );
      },
      greet: async (sessionId, content) => {
        await this.inbox.postToSession(sessionId, content, {
          kind: "greeting",
        });
      },
      removeDependents: async (agentId) => {
        this.delegations.forgetPersona(agentId);
        await this.removeRoutinesOf(agentId);
      },
      applyRole: (agentId, homeSessionId, role) =>
        this.applyPersonaRole(agentId, homeSessionId, role),
      announceChanged: () =>
        this.events.emit("daemon.event", {
          type: "data.changed",
          areas: ["personal", "agent"],
        }),
    });
    const routineSessions = createRoutineSessions({
      getPersona: (id) => this.state.data.personalAgents.getById(id),
      createSession: (input) => this.createSession(input),
      archiveSession: (sessionId) => this.archiveSession(sessionId),
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      waitForSessionTurn: (sessionId) => this.waitForSessionTurn(sessionId),
      stopSessionTurn: (sessionId) => this.stopSession(sessionId),
    });
    this.routines = new RoutineService({
      repository: this.state.data.routines,
      personaExists: async (id) =>
        this.state.data.personalAgents.getById(id) !== null,
      ensureSession: routineSessions.ensureSession,
      runTurn: routineSessions.runTurn,
      deliverResult: (routine, run, content) =>
        this.inbox
          .postToHomeThread(routine.agentId, content, {
            kind: "routine",
            routineId: routine.id,
            routineName: routine.name,
            runId: run.id,
            ...(run.sessionId ? { sessionId: run.sessionId } : {}),
          })
          .then(() => undefined),
      alertRun: (run) => this.alertRoutineRun(run),
      announceChanged: () =>
        this.events.emit("daemon.event", {
          type: "data.changed",
          areas: ["routines"],
        }),
    });
    this.outbox = new OutboxService({
      repository: this.state.data.pushOutbox,
      push: this.push,
      getSession: (sessionId) => this.state.getSession(sessionId),
      target: (session) => this.alertTarget(session),
      emit: (event) => this.events.emit("daemon.event", event),
    });
    this.providerCredentials = new ProviderCredentials(
      this.state,
      options.userDataPath,
      createCredentialVault(options.userDataPath, {
        store:
          runtime.kind === "headless"
            ? headlessCredentialStore(process.platform)
            : "keyring",
      }),
    );
    this.providerLogins = new ProviderLoginSessions(
      (providerId, method, interaction) =>
        loginPiProvider(options.userDataPath, providerId, method, interaction),
      (providerId) => this.providerCredentials.setApiKey(providerId, null),
    );
    this.acpRegistry = new AcpRegistryService(this.state, options.userDataPath);
    this.agents = new AgentCatalog({
      state: this.state,
      acpRegistry: this.acpRegistry,
      cancelLogin: (agentId) => this.agentAuth.cancelLogin(agentId),
      liveSessionIds: (agentId) => this.runtime.liveSessionIdsForAgent(agentId),
      disposeSession: (sessionId) => this.disposeSessionRuntime(sessionId),
      emit: (event) => this.events.emit("daemon.event", event),
    });
    this.agentAuth = new AgentAuthService({
      registry: this.acpRegistry,
      liveSessionIds: (agentId) => this.runtime.liveSessionIdsForAgent(agentId),
      disposeSession: (sessionId) => this.disposeSessionRuntime(sessionId),
    });
    this.providerService = new DaemonProviderService(
      this.state,
      this.providerCredentials,
    );
    this.commitMessageService = new DaemonCommitMessageService(
      this.state,
      (snapshot) => this.providerCredentials.resolveSnapshot(snapshot),
    );
    this.memory = new MemoryService({
      userDataPath: options.userDataPath,
      state: this.state,
      broadcast: (event) => this.events.emit("daemon.event", event),
      resolveSessionProvider: (session) =>
        this.providerCredentials.forSession(session),
      startRuntime: options.autoStartMemory !== false,
    });
    this.attachments = new DaemonAttachmentStore(options.userDataPath);
    this.workspaces = new WorkspaceHost({
      state: this.state,
      userDataPath: options.userDataPath,
      attachments: this.attachments,
      commitMessages: this.commitMessageService,
      emit: (event) => this.events.emit("daemon.event", event),
    });
    this.settings = new DaemonSettingsService({
      state: this.state,
      memory: this.memory,
      commitMessages: this.commitMessageService,
      getWorktreeEnvironment: (workspaceId) =>
        this.workspaces.getWorktreeEnvironment(workspaceId),
      setDisabledAgentIds: (agentIds) =>
        this.agents.replaceDisabledAgentIds(agentIds),
      emit: (event) => this.events.emit("daemon.event", event),
    });
    this.worktrees = new WorktreeLifecycle(
      this.state,
      this.userDataPath,
      (workspaceId) => this.workspaces.getWorktreeEnvironment(workspaceId),
      () => this.workspaces.scanPolicy.invalidate(),
    );
    this.searchService = new DaemonSearchService({
      broadcast: (event) => this.events.emit("daemon.event", event),
      canScanRoot: (rootPath) => this.workspaces.scanPolicy.canScan(rootPath),
    });
    this.terminals = new TerminalService({
      emit: (event) => this.events.emit("terminal.event", event),
      listWorkspaceRootPaths: () => this.workspaces.listWorkspaceRootPaths(),
    });
    this.mcp = new DaemonMcpService(
      options.userDataPath,
      async (workspaceId) => {
        const workspace = (await this.state.listWorkspaces()).find(
          (candidate) => candidate.id === workspaceId,
        );
        return workspace?.rootPaths[0] ?? null;
      },
    );
    this.skillsService = new DaemonSkillsService(undefined, (rootPath) =>
      this.workspaces.scanPolicy.canScan(rootPath),
    );
    this.skillLibrary = new DaemonSkillLibraryService({
      userDataPath: options.userDataPath,
      home: homedir(),
      settings: this.state.appSettings,
      listWorkspaces: () => this.state.listWorkspaces(),
    });
    this.pdfAnnotationsService = new DaemonPdfAnnotationsService(
      options.userDataPath,
      (filePath) => this.workspaces.resolvePdfPath(filePath),
    );
    this.agentTools = new AgentToolBridge({
      url: options.agentToolsUrl ?? null,
      getSession: (sessionId) => this.state.getSession(sessionId),
      getTeamId: (sessionId) => this.team.teamIdForSession(sessionId),
      getLeadRoster: (sessionId) => this.team.rosterForLead(sessionId),
      memoryInstructions: async (hasMemoryTools, caller) => {
        if (!hasMemoryTools) return undefined;
        if (caller.sessionKind === "personal") {
          return this.memory.agentInstructions(true, true);
        }
        const session = await this.state.getSession(caller.sessionId);
        const hostRsrs = session
          ? await this.memory.hostInstructsRsrs(session.agentType)
          : false;
        return this.memory.agentInstructions(true, false, hostRsrs);
      },
    });
    this.peerMessaging = new PeerMessagingService({
      getSession: (sessionId) => this.state.getSession(sessionId),
      listSessions: () => this.state.listSessions(),
      hasActiveTurn: (sessionId) => this.runs.hasActiveRun(sessionId),
      supportsSteering: (session) => this.agents.supportsSteering(session),
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      broadcast: (event) => this.events.emit("daemon.event", event),
      peerScope: (sessionId) => this.team.peerScope(sessionId),
    });
    this.team = new TeamModule({
      repository: this.state.teams,
      getSession: (sessionId) => this.state.getSession(sessionId),
      saveSession: (session) => this.state.saveSession(session),
      getAgentRole: (id) => this.state.getAgentRole(id),
      listAgentRoles: () => this.state.listAgentRoles(),
      getSetting: (key) => this.state.getAppSetting(key),
      setSetting: (key, value) => this.state.setAppSetting(key, value),
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      sendPeerMessage: (payload, render) =>
        this.peerMessaging.send(payload, render),
      deliverReport: (report) => this.deliverTeammateReport(report),
      hasActiveRun: (sessionId) => this.runs.hasActiveRun(sessionId),
      supportsSteering: (session) => this.agents.supportsSteering(session),
      getRunReply: (sessionId, runId) =>
        this.state.getRunReply(sessionId, runId),
      latestRun: (sessionId) => this.state.getLatestRun(sessionId),
      stopSession: (sessionId) => this.stopTeammateSession(sessionId),
      track: (work) => void this.runs.track(work),
      onReportFailed: (error) =>
        logDaemonDiagnostic("warn", "team.reportFailed", {
          error: errorMessage(error, "Unknown error"),
        }),
      isSessionBusy: (sessionId) =>
        this.runs.hasActiveRun(sessionId) ||
        this.queuedFollowUps.has(sessionId),
      getMessage: (messageId) => this.state.getMessageById(messageId),
      createWorktree: (input) => this.worktrees.createWorktree(input),
      broadcast: (event) => {
        this.events.emit("daemon.event", event);
        this.events.emit("daemon.event", {
          type: "data.changed",
          areas: ["agent"],
        });
      },
    });
    registerMessagingTools(this.agentTools.registry, {
      listPeers: (fromSessionId) => this.peerMessaging.listPeers(fromSessionId),
      sendPeerMessage: (payload) => this.peerMessaging.send(payload),
    });
    registerTeamTools(this.agentTools.registry, this.team);
    const workSessions = {
      createSession: (input: CreateSessionPayload) => this.createSession(input),
      saveSession: (session: SessionRecord) => this.state.saveSession(session),
      createWorktree: (input: { workspaceId: string; branch: string }) =>
        this.worktrees.createWorktree(input),
      sendSessionMessage: (command: SendSessionCommand) =>
        this.sendSessionMessage(command),
      hasActiveRun: (sessionId: string) => this.runs.hasActiveRun(sessionId),
      supportsSteering: (session: SessionRecord) =>
        this.agents.supportsSteering(session),
    };
    const waitingFor = (sessionId: string) =>
      pendingInteractionKind(this.runtime.getPendingInteractions(), sessionId);
    const workReports = new WorkReports();
    this.remoteWork = new RemoteWorkHost({
      ...workSessions,
      reports: workReports,
      listWorkspaces: () => this.state.listWorkspaces(),
      listRoles: () => this.listAgentRoles(),
      getSession: (sessionId) => this.state.getSession(sessionId),
      stopSession: (sessionId) => this.stopSession(sessionId),
      latestRun: (sessionId) => this.state.getLatestRun(sessionId),
      getRunReply: (sessionId, runId) =>
        this.state.getRunReply(sessionId, runId),
      waitingFor,
      announceChanged: () => this.announceSessionsChanged(),
    });
    this.delegations = new DelegationModule({
      ...workSessions,
      waitingFor,
      reports: workReports,
      issues: {
        resolve: async (ref) => {
          const issue = await this.dataService.resolveIssue(ref);
          return issue ? { id: issue.id, identifier: issue.identifier } : null;
        },
        attach: (issueId, sessionId) =>
          this.dataService.startIssueWork(issueId, sessionId),
        comment: (sessionId, body) =>
          this.dataService.commentSessionIssues(sessionId, body),
      },
      remote: remoteWorkGateway(this.remoteHosts),
      repository: this.state.data.delegations,
      getPersona: async (personaId) => {
        const row = this.state.data.personalAgents.getById(personaId);
        if (!row) return null;
        const role = await this.state.getAgentRole(row.roleId);
        return {
          id: row.id,
          name: role?.name ?? row.id,
          homeSessionId: row.homeSessionId,
        };
      },
      getSession: (sessionId) => this.state.getSession(sessionId),
      listWorkspaces: () => this.state.listWorkspaces(),
      listRoles: () => this.listAgentRoles(),
      listTemplates: () => this.team.listTemplates(),
      createTeam: (input) => this.team.create(input),
      submitReport: (command, options) =>
        this.submitSessionMessage(command, options),
      stopSession: (sessionId) => this.stopSession(sessionId),
      latestRun: (sessionId) => this.state.getLatestRun(sessionId),
      getRunReply: (sessionId, runId) =>
        this.state.getRunReply(sessionId, runId),
      getMessage: (messageId) => this.state.getMessageById(messageId),
      track: (work) => void this.runs.track(work),
      onReportFailed: (error) =>
        logDaemonDiagnostic("warn", "delegation.reportFailed", {
          error: errorMessage(error, "Unknown error"),
        }),
      announceChanged: () => this.announceSessionsChanged(),
    });
    registerHistoryTools(this.agentTools.registry, {
      readSessionActivity: (caller, sessionId) =>
        readSessionActivity(
          this.sessionActivityReader(),
          caller.sessionId,
          sessionId,
          (id) =>
            this.state.data.delegations.get(id)?.requesterSessionId ?? null,
        ),
    });
    registerMemoryTools(this.agentTools.registry, {
      isEnabled: () => this.memory.areToolsEnabledSync(),
      recall: async (input, caller) => {
        const scope = await this.personaMemoryScopeFor(caller.sessionId);
        return this.memory.recallIn(input, scope?.read ?? null);
      },
      show: async (id, caller) => {
        const scope = await this.personaMemoryScopeFor(caller.sessionId);
        return this.memory.showIn(id, scope?.read ?? null);
      },
      remember: async (input, caller, target) => {
        const scope = await this.personaMemoryScopeFor(caller.sessionId);
        return this.memory.rememberIn(
          input,
          scope ? personaWritePartition(scope, target) : null,
        );
      },
      policy: (caller) =>
        caller.sessionKind === "personal"
          ? Promise.resolve(this.memory.agentInstructions(true, true))
          : this.memory.policy(),
      noteToolUse: (sessionId, tool) =>
        this.memory.noteGateToolUse(sessionId, tool),
    });
    this.scriptRuns = new ScriptRunModule({
      repository: this.state.scriptRuns,
      getSession: (sessionId) => this.state.getSession(sessionId),
      saveSession: (session) => this.state.saveSession(session),
      saveAgent: (agent) => this.state.scriptRuns.saveAgent(agent),
      getAgentRole: (id) => this.state.getAgentRole(id),
      getSetting: (key) => this.state.getAppSetting(key),
      setSetting: (key, value) => this.state.setAppSetting(key, value),
      createWorktree: (input) => this.worktrees.createWorktree(input),
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      waitForSessionTurn: (sessionId) => this.waitForSessionTurn(sessionId),
      hasActiveTurn: (sessionId) => this.runs.hasActiveRun(sessionId),
      supportsSteering: (session) => this.agents.supportsSteering(session),
      stopSession: (sessionId) => this.stopSession(sessionId),
      broadcast: (event) => {
        this.events.emit("daemon.event", event);
        this.events.emit("daemon.event", {
          type: "data.changed",
          areas: ["agent"],
        });
      },
      now: () => new Date().toISOString(),
      createId: () => crypto.randomUUID(),
    });
    registerScriptRunTools(this.agentTools.registry, this.scriptRuns);
    const personaOf = async (sessionId: string) => {
      const session = await this.state.getSession(sessionId);
      return session
        ? (this.personalAgents.personaForSession(session)?.id ?? null)
        : null;
    };
    this.applications = new ApplicationService(
      this.mcp,
      async (id) => (await this.personalAgents.get(id)) !== null,
      undefined,
      () =>
        this.events.emit("daemon.event", {
          type: "data.changed",
          areas: ["applications"],
        }),
    );
    registerApplicationTools(
      this.agentTools.registry,
      this.applications,
      (sessionId) =>
        resolveApplicationPrincipal(sessionId, {
          getSession: (id) => this.state.getSession(id),
          persona: (session) =>
            this.personalAgents.personaForSession(session)?.id ?? null,
          delegation: (id) =>
            this.state.data.delegations.get(id)?.personaId ?? null,
          teamLead: async (id) =>
            (await this.team.findForSession(id))?.team.leadSessionId ?? null,
        }),
    );
    registerWorkTools(this.agentTools.registry, {
      personaOf,
      catalog: (query) => this.delegations.catalog(query),
      start: (payload) => this.delegations.start(payload),
      list: (personaId) => this.delegations.list(personaId),
      send: (payload) => this.delegations.send(payload),
      stop: (target) => this.delegations.stop(target),
      reporting: (sessionId) =>
        this.delegations.reporting(sessionId) ||
        this.remoteWork.reporting(sessionId),
      report: (sessionId, report) =>
        this.delegations.reporting(sessionId)
          ? this.delegations.recordReport(sessionId, report)
          : this.remoteWork.recordReport(sessionId, report),
    });
    registerAssistantTools(this.agentTools.registry, {
      personaOf,
      setUserAddress: async (personaId, userAddress) =>
        (await this.personalAgents.update({ id: personaId, userAddress }))
          .userAddress,
    });
    registerRoutineTools(this.agentTools.registry, {
      personaOf,
      list: (agentId) => this.routines.list(agentId),
      get: (id) => this.routines.get(id),
      create: (payload) => this.routines.create(payload),
      update: (payload) => this.routines.update(payload),
      delete: (id, callerSessionId) => this.deleteRoutine(id, callerSessionId),
      run: (id) => this.routines.runNow(id).run,
      runs: (routineId, limit) => this.routines.runs(routineId, limit),
      reporting: (sessionId) => this.routines.isReporting(sessionId),
      report: (sessionId, report) => this.routines.report(sessionId, report),
    });
    registerSettingsTools(this.agentTools.registry, {
      getWorktreeEnvironment: (workspaceId) =>
        this.workspaces.getWorktreeEnvironment(workspaceId),
      proposeWorktreeEnvironment: (input) =>
        this.workspaces.proposeWorktreeEnvironment(input),
      getSettingValue: (key, workspaceId) =>
        this.settings.getValue(key, workspaceId),
      setSettingValue: (input) => this.settings.setValue(input),
    });
    this.runs = new SessionRunCoordinator({
      store: this.state,
      emit: (event) => this.runtime.emitAgentEvent(event),
      afterPersistedEvents: (work) => this.runtime.withEventPersistence(work),
      onRunSettled: (run) => void this.startNextQueuedFollowUp(run.sessionId),
      onRunEnded: (run) => this.runCapacity.onRunEnded(run),
      now: () => new Date().toISOString(),
      createId: () => crypto.randomUUID(),
    });
    this.runCapacity = new RunCapacity({
      readLimits: () => this.settings.readAgentRunLimits(),
      activeAgentTypes: () => this.activeAgentTypes(),
      getSession: (sessionId) => this.state.getSession(sessionId),
      hasActiveRun: (sessionId) => this.runs.hasActiveRun(sessionId),
      dispatchQueued: (sessionId) => this.startNextQueuedFollowUp(sessionId),
      expireRun: (sessionId, runId, reason) =>
        this.expireRun(sessionId, runId, reason),
      track: (work) => void this.runs.track(work),
      onError: (error) =>
        logDaemonDiagnostic("error", "runs.capacityFailed", { error }),
    });
    this.runtime = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => {
        this.events.emit("daemon.event", event);
      },
      activeRunId: (sessionId) => this.runs.activeRunId(sessionId),
      onProviderEvent: (event) => this.runs.noteProviderEvent(event),
      userDataPath: options.userDataPath,
      agentTools: this.agentTools,
      resolveMcpServers: async (agentId) =>
        (await this.agents.isAgentDisabled(agentId))
          ? []
          : this.mcp.serversForAgent(agentId),
      reclaim: {},
    });
    this.workspaceChanges = createWorkspaceChangeCoordinator({
      userDataPath: options.userDataPath,
      repository: this.state.turnChangeSets,
      getNativeSession: (sessionId) => this.runtime.getAgentSession(sessionId),
      onChangeSet: (changeSet) => {
        this.events.emit("daemon.event", {
          type: "workspace.changes.updated",
          sessionId: changeSet.sessionId,
          changeSet,
        });
      },
    });
    void this.reconcileWorkspaceChanges();
    this.checkpointReconcileTimer = setInterval(
      () => void this.reconcileWorkspaceChanges(),
      CHECKPOINT_RECONCILE_INTERVAL_MS,
    );
    this.checkpointReconcileTimer.unref?.();
    this.runtime.configureAgentEventPersistence(async (event, context) => {
      const persisted = await this.state.persistAgentEvent(event, context);
      await this.state.sessionAttention.applyEvent(event);
      if (isSessionRuntimeEvent(event)) this.sessionRuntimeStates.apply(event);
      if (event.type === "session.mode.updated" && event.availableModes) {
        await this.state.cacheSessionModes(
          event.sessionId,
          event.availableModes,
        );
      }
      if (event.type === "tool.started") {
        if (toolMayMutateWorkspace(event.toolCall)) {
          this.workspaceChanges.markToolActivity(event.sessionId);
        }
      }
      if (event.type === "workspace.native-evidence") {
        await this.workspaceChanges.ingestNativeEvidence({
          sessionId: event.sessionId,
          userMessageId: event.userMessageId,
          evidence: event.evidence,
        });
      }
      if (
        event.type === "message.completed" &&
        event.message.role === "assistant"
      ) {
        await this.workspaceChanges.bindAssistantMessage({
          sessionId: event.sessionId,
          messageId: event.message.id,
        });
      }
      if (event.type === "turn.completed") {
        await this.workspaceChanges.finalizeTurn({
          sessionId: event.sessionId,
          messageId: event.messageId,
        });
        const completedSession = await this.state.getSession(event.sessionId);
        if (completedSession && isChatSession(completedSession)) {
          void this.memory.captureTurn(event.sessionId, event.messageId);
        } else if (completedSession) {
          void this.memory.finishTurn({
            sessionId: event.sessionId,
            enforce: (completedSession.sessionKind ?? "main") !== "subagent",
          });
        }
      }
      await this.team.onAgentEvent(event);
      await this.delegations.onAgentEvent(event);
      const alert = pushTriggerForEvent(event, new Date());
      if (alert && !this.reportedByAssistant(alert)) {
        void this.outbox
          .alert(alert, "turn")
          .catch((error: unknown) =>
            logDaemonDiagnostic("warn", "outbox.alertFailed", { error }),
          );
      }
      if (event.type === "state.changed" && event.status === "error") {
        await this.workspaceChanges.failTurn(event.sessionId, "failed");
      }
      return persisted;
    });
    if (options.autoStartMemory === true) {
      void this.memory.initializeOnStartup();
    }
  }

  private reportedByAssistant(alert: PushTrigger) {
    const turnEnd =
      alert.kind === "turnCompleted" || alert.kind === "turnFailed";
    return (
      turnEnd &&
      (this.delegations.reporting(alert.sessionId) ||
        this.remoteWork.reporting(alert.sessionId))
    );
  }

  startBackgroundRecovery() {
    if (this.startupRecovery || this.stopping) return;
    this.startupRecovery = this.runs.track(this.recoverInterruptedWork());
  }

  private async recoverInterruptedWork() {
    try {
      await this.state.waitForStartupRecovery();
      await this.scriptRuns.recoverInterrupted();
      await this.team.recoverReports();
      await this.delegations.recoverReports();
      await this.decks.collectUnusedImages();
      await this.personalAgents.reconcileRoles();
      if (!this.stopping) {
        this.routines.start();
        this.outbox.start();
      }
    } catch {
      logDaemonDiagnostic("warn", "daemon.recoveryUnavailable");
    }
  }

  private alertTarget(session: SessionRecord) {
    const persona = this.personalAgents.personaForSession(session);
    const muted = persona
      ? (this.state.data.personalAgents.getById(persona.id)?.mutedAt ?? null)
      : null;
    return {
      sessionKind: session.sessionKind,
      personaMuted: muted !== null,
      routineDeliver: this.routines.findBySession(session.id)?.deliver ?? null,
    };
  }

  private async alertRoutineRun(run: RoutineRunRecord) {
    const alert = routineRunAlert(run);
    if (!alert || !run.sessionId || !run.finishedAt) return;
    await this.outbox
      .alert(
        {
          sessionId: run.sessionId,
          kind: alert.kind,
          detail: alert.detail,
          requestId: null,
          at: run.finishedAt,
        },
        "routine",
      )
      .catch((error: unknown) =>
        logDaemonDiagnostic("warn", "outbox.alertFailed", { error }),
      );
  }

  async deleteRoutine(id: string, keepSessionId?: string) {
    const sessionIds = this.routineSessionIds(id);
    this.routines.delete(id);
    for (const sessionId of sessionIds) {
      if (sessionId !== keepSessionId) await this.removeSession(sessionId);
    }
  }

  private routineSessionIds(routineId: string) {
    const routine = this.routines.get(routineId);
    const ids = new Set(this.routines.sessionIds(routineId));
    if (routine?.sessionId) ids.add(routine.sessionId);
    return [...ids];
  }

  private async removeRoutinesOf(agentId: string) {
    const sessionIds = this.routines
      .list(agentId)
      .flatMap((routine) => this.routineSessionIds(routine.id));
    this.routines.deleteForAgent(agentId);
    for (const sessionId of sessionIds) await this.removeSession(sessionId);
  }

  async archiveSession(sessionId: string) {
    const archived = await this.archiveSessionQuietly(sessionId);
    if (archived) this.announceSessionsChanged();
    return archived;
  }

  private announceSessionsChanged() {
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["agent"],
    });
  }

  private async archiveSessionQuietly(sessionId: string) {
    validateSessionId(sessionId);
    this.assertNotPersonalHome(sessionId);
    await this.team.onLeadStopped(sessionId);
    await this.scriptRuns.cancelForRequester(sessionId);
    const session = await this.state.getSession(sessionId);
    if (session && isChatSession(session)) {
      void this.memory.saveSession({ sessionId });
    }
    return this.sessionCommands.run(sessionId, async () => {
      await this.stopSessionTurn(sessionId);
      this.queuedFollowUps.forget(sessionId);
      return this.state.archiveSession(sessionId);
    });
  }

  async restoreSession(sessionId: string) {
    const restored = await this.restoreSessionQuietly(sessionId);
    if (restored.length > 0) this.announceSessionsChanged();
    return restored;
  }

  private async restoreSessionQuietly(sessionId: string) {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, () =>
      this.state.restoreSession(sessionId),
    );
  }

  async archiveSessions(sessionIds: string[]): Promise<ArchiveSessionsResult> {
    sessionIds.forEach(validateSessionId);
    const pending = this.runtime.getPendingInteractions();
    const waitingIds = new Set(
      [
        ...pending.permissions,
        ...pending.questions,
        ...pending.planApprovals,
      ].map((item) => item.sessionId),
    );
    const { rootIds, skippedCount } = selectArchivableRoots(
      await this.state.listSessions(),
      sessionIds,
      (sessionId) =>
        waitingIds.has(sessionId) ||
        this.runs.hasActiveRun(sessionId) ||
        this.queuedFollowUps.has(sessionId),
    );
    const archivedSessionIds: string[] = [];
    for (const rootId of rootIds) {
      if (await this.archiveSessionQuietly(rootId)) {
        archivedSessionIds.push(rootId);
      }
    }
    if (archivedSessionIds.length > 0) {
      this.events.emit("daemon.event", {
        type: "data.changed",
        areas: ["agent"],
      });
    }
    return { archivedSessionIds, skippedCount };
  }

  async restoreSessions(sessionIds: string[]) {
    sessionIds.forEach(validateSessionId);
    const restored: SessionRecord[] = [];
    for (const sessionId of new Set(sessionIds)) {
      restored.push(...(await this.restoreSessionQuietly(sessionId)));
    }
    if (restored.length > 0) {
      this.events.emit("daemon.event", {
        type: "data.changed",
        areas: ["agent"],
      });
    }
    return restored;
  }

  status(): CocurdexDaemonStatus {
    return {
      hostId: this.hostAccess.identity().hostId,
      pid: process.pid,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      runtimeFingerprint: this.runtimeFingerprint,
      socketPath: this.socketPath,
      startedAt: this.startedAt,
    };
  }

  getActiveWork() {
    return {
      agentTurns: this.runs.activeWorkCount,
      queuedInputs: this.queuedFollowUps.size,
      workspaceSearches: this.searchService.activeCount,
    };
  }

  syncKeepAwake() {
    this.keepAwakeSync = this.keepAwakeSync
      .then(async () => {
        if (this.shutdownPromise) return;
        const status = await this.hostAccess.remoteAccessStatus();
        this.keepAwake.set(status.listening && status.settings.keepAwake);
      })
      .catch((error: unknown) =>
        logDaemonDiagnostic("warn", "daemon.keepAwakeFailed", { error }),
      );
  }

  shutdown() {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.performShutdown();
    }
    return this.shutdownPromise;
  }

  async bootstrap(): Promise<AppBootstrapData> {
    const data = await this.state.bootstrap();
    return {
      ...data,
      pausedQueueSessionIds: this.pausedQueueSessionIds(data.queuedAgentInputs),
      workspaces: data.workspaces.map(withMissingRootPaths),
    };
  }

  listSessionAttention() {
    return this.state.sessionAttention.list();
  }

  updateSessionAttention(payload: UpdateSessionAttentionPayload) {
    return this.state.sessionAttention.update(payload);
  }

  private async reconcileWorkspaceChanges() {
    try {
      const workspaces = await this.state.listWorkspaces();
      await this.workspaceChanges.reconcile(
        workspaces.flatMap((workspace) => workspace.rootPaths),
      );
    } catch (error) {
      logDaemonDiagnostic("warn", "workspace-changes.reconcile failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await this.state.maintainStorage();
  }

  listSessions() {
    return this.state.listSessions();
  }

  listPendingInteractions() {
    return this.runtime.getPendingInteractions();
  }

  private readEventSeq: () => number = () => 0;

  bindEventSeqProvider(provider: () => number) {
    this.readEventSeq = provider;
  }

  async pullSync(input: SyncPullInput): Promise<SyncPullResult> {
    return this.runtime.withEventPersistence(async () => {
      const eventSeq = this.readEventSeq();
      await this.state.getDatabase();
      const result = await pullSync(
        this.state.syncSources({
          getPlan: (sessionId) => this.runtime.getSessionPlan(sessionId),
          getInteractions: () => this.runtime.getPendingInteractions(),
        }),
        { epoch: this.startedAt, eventSeq },
        input,
      );
      return {
        ...result,
        pausedQueueSessionIds: this.pausedQueueSessionIds(
          result.queuedAgentInputs,
        ),
      };
    });
  }

  private pausedQueueSessionIds(inputs: QueuedAgentInputRecord[]) {
    const sessionIds = new Set(inputs.map((input) => input.sessionId));
    return [...sessionIds].filter(
      (sessionId) =>
        !this.queuedFollowUps.has(sessionId) &&
        !this.runs.hasActiveRun(sessionId),
    );
  }

  async getSessionSnapshot(sessionId: string) {
    validateSessionId(sessionId);
    const session = await this.state.getSession(sessionId);
    if (!session) {
      return null;
    }

    const [page, queuedAgentInputs, usage] = await Promise.all([
      this.state.readTranscriptPage(sessionId, null),
      this.state.listQueuedAgentInputs(sessionId),
      this.state.getSessionUsage(sessionId),
    ]);

    return {
      session,
      messages: page.messages,
      activeMessages: this.state.listActiveMessagesBySessionId(sessionId),
      toolCalls: page.toolCalls,
      queuedAgentInputs,
      activeRun: this.state.getActiveRun(sessionId),
      usage,
      turnStats: page.turnStats,
      turnChangeSets: page.turnChangeSets,
      interactions: this.runtime.getSessionInteractions(sessionId),
      plan: this.runtime.getSessionPlan(sessionId),
      olderBeforeSeq: page.olderBeforeSeq,
    };
  }

  async getSessionTranscriptPage(sessionId: string, beforeSeq: number | null) {
    validateSessionId(sessionId);
    return this.state.readTranscriptPage(sessionId, beforeSeq);
  }

  getSessionExecutionTree(sessionId: string, maxDepth?: number) {
    return loadExecutionTree(
      {
        listSessions: () => this.state.listSessions(),
        listRuns: (id) => this.state.listRunsBySessionId(id),
        listToolCalls: (id) => this.state.listToolCallSummaries(id),
        getInteractions: () => this.runtime.getPendingInteractions(),
        getPlan: (id) => this.runtime.getSessionPlan(id),
      },
      sessionId,
      maxDepth,
    );
  }

  async listAgentRoles() {
    const roles = await this.state.listAgentRoles();
    return roles.filter((role) => !this.personalAgents.ownsRole(role.id));
  }

  getAgentRole(id: string) {
    return this.state.getAgentRole(id);
  }

  private async applyPersonaRole(
    agentId: string,
    homeSessionId: string,
    role: AgentRoleRecord,
  ) {
    const home = await this.state.getSession(homeSessionId);
    if (home && home.title !== role.name) {
      await this.updateSessionTitle({
        sessionId: homeSessionId,
        title: role.name,
      });
    }
    const { providerId, modelId } = role;
    if (!providerId || !modelId) {
      const adopted =
        home?.agentType === role.agentId
          ? personaRoleFromHomeThread(role, home.providerSnapshot)
          : null;
      if (adopted) await this.saveAgentRole(adopted);
      return;
    }
    const routineSessionIds = this.routines
      .list(agentId)
      .map((routine) => routine.sessionId);
    for (const sessionId of [homeSessionId, ...routineSessionIds]) {
      if (!sessionId) continue;
      const session = await this.state.getSession(sessionId);
      if (!session || session.archivedAt) continue;
      if (session.agentType !== role.agentId) continue;
      if (
        session.providerSnapshot &&
        !personaRoleFromHomeThread(role, session.providerSnapshot)
      )
        continue;
      await this.applySessionRuntime(
        {
          sessionId,
          model: { providerId, modelId },
          runtime: {
            reasoningEffort: role.reasoningEffort,
            thinkingLevel: role.thinkingLevel,
            serviceTier: role.serviceTier,
            fastMode: role.fastMode,
          },
        },
        LOCAL_REQUEST_CONTEXT.principal,
      );
    }
  }

  private async adoptHomeThreadRuntime(session: SessionRecord) {
    const persona = this.state.data.personalAgents.findByHomeSession(
      session.id,
    );
    if (!persona) return;
    const role = await this.state.getAgentRole(persona.roleId);
    if (!role || role.agentId !== session.agentType) return;
    const adopted = personaRoleFromHomeThread(role, session.providerSnapshot);
    if (adopted) await this.saveAgentRole(adopted);
  }

  async saveAgentRole(payload: SaveAgentRolePayload): Promise<AgentRoleRecord> {
    const name = normalizeAgentRoleName(payload.name);
    if (!name) {
      throw new Error("Agent role name is required.");
    }
    if (!isAgentId(payload.agentId)) {
      throw new Error("Agent role adapter is invalid.");
    }
    if (payload.id && this.personalAgents.ownsRole(payload.id)) {
      assertPersonalAgentRuntime(payload.agentId);
    }

    const now = new Date().toISOString();
    const existing = payload.id
      ? await this.state.getAgentRole(payload.id)
      : null;
    const role: AgentRoleRecord = {
      id: existing?.id ?? payload.id ?? crypto.randomUUID(),
      name,
      agentId: payload.agentId,
      providerId: payload.providerId,
      modelId: payload.modelId,
      modelName: payload.modelName,
      permissionMode: payload.permissionMode,
      sessionModeId: payload.sessionModeId ?? null,
      reasoningEffort: payload.reasoningEffort,
      serviceTier: payload.serviceTier,
      fastMode: payload.fastMode,
      thinkingLevel: payload.thinkingLevel,
      openCodeAgent: payload.openCodeAgent,
      openCodeVariant: payload.openCodeVariant,
      description:
        payload.description === undefined
          ? (existing?.description ?? null)
          : normalizeAgentRoleDescription(payload.description),
      instructions:
        payload.instructions === undefined
          ? (existing?.instructions ?? null)
          : payload.instructions,
      skillIds:
        payload.skillIds === undefined
          ? (existing?.skillIds ?? null)
          : payload.skillIds,
      avatar:
        payload.avatar === undefined
          ? (existing?.avatar ?? null)
          : normalizeAgentRoleAvatar(payload.avatar),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.state.saveAgentRole(role);
    await this.personalAgents.roleSaved(role);
    return role;
  }

  async deleteAgentRole(id: string) {
    if (this.personalAgents.ownsRole(id)) {
      throw new Error("Delete the personal agent instead of its role");
    }
    await this.state.deleteAgentRole(id);
  }

  async saveSessionConfiguration(
    input: SessionConfiguration,
    principal: HostPrincipal = LOCAL_REQUEST_CONTEXT.principal,
  ) {
    validateSessionConfiguration(input);
    const session = await this.sessionCommands.run(input.id, async () =>
      this.configureSession(
        principalHasScope(principal, "credentials")
          ? input
          : await this.withServerProviderConnection(input),
      ),
    );
    this.announceSessionsChanged();
    return session;
  }

  private async newSessionContext(
    input: CreateSessionPayload,
  ): Promise<NewSessionContext> {
    const sessions = await this.state.listSessions();
    const role = input.agentRoleId
      ? await this.state.getAgentRole(input.agentRoleId)
      : null;
    if (input.agentRoleId && !role) {
      throw new Error(`Agent role ${input.agentRoleId} was not found.`);
    }
    const { workspaceId } = input;
    return {
      role,
      agents: await this.agents.detectAgents(input.agentType ?? role?.agentId),
      discoverCapabilities: async (agent) => {
        const [discovered] = await this.agents.discoverAgentCapabilities([
          agent,
        ]);
        return discovered ?? agent;
      },
      workspaceSessions: sessions
        .filter((session) => session.workspaceId === workspaceId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      compatibleModels: (agentId) =>
        this.providerService.listCompatibleProviderModels(agentId),
      defaultModel: (agentId) =>
        this.providerService.getAgentProviderDefault(agentId),
    };
  }

  async updateSessionRuntime(
    input: UpdateSessionRuntimePayload,
    principal: HostPrincipal,
  ) {
    const saved = await this.applySessionRuntime(input, principal);
    await this.adoptHomeThreadRuntime(saved);
    return saved;
  }

  private async applySessionRuntime(
    input: UpdateSessionRuntimePayload,
    principal: HostPrincipal,
  ) {
    const session = await this.state.getSession(input.sessionId);
    if (!session) throw new Error(`Session ${input.sessionId} was not found.`);
    const agent = (await this.agents.listAgents(session.agentType)).find(
      (candidate) => candidate.id === session.agentType,
    );
    const configuration = resolveRuntimeUpdate(session, input, {
      compatibleModels: await this.providerService.listCompatibleProviderModels(
        session.agentType,
      ),
      permissionModes:
        agent?.capabilities.permissionModes.map((option) => option.id) ?? [],
    });
    return this.saveSessionConfiguration(configuration, principal);
  }

  async resolveNewSessionDefaults(input: CreateSessionPayload) {
    return resolveNewSessionDefaults(
      input,
      await this.newSessionContext(input),
    );
  }

  async createSession(input: CreateSessionPayload) {
    const configuration = await resolveNewSession(
      input,
      crypto.randomUUID(),
      await this.newSessionContext(input),
    );
    return this.saveSessionConfiguration(configuration);
  }

  private async withServerProviderConnection(
    input: SessionConfiguration,
  ): Promise<SessionConfiguration> {
    const snapshot = input.providerSnapshot;
    if (!snapshot) return input;
    const configs = await this.state.listProviderConfigs();
    const config =
      configs.find((candidate) => candidate.id === snapshot.providerId) ?? null;
    const models = config ? await this.state.listProviderModels(config.id) : [];
    const stored = await this.state.getSession(input.id);
    return {
      ...input,
      providerSnapshot: withServerProviderConnection(snapshot, {
        config,
        model:
          models.find((candidate) => candidate.modelId === snapshot.modelId) ??
          null,
        stored: stored?.providerSnapshot ?? null,
      }),
    };
  }

  private async configureSession(input: SessionConfiguration) {
    await this.agents.ensureAvailable(input.agentType);
    if (isChatWorkspaceId(input.workspaceId)) {
      await this.workspaces.ensureFormWorkspace(CHAT_WORKSPACE_ID, "Chat");
    }
    if (isPersonalWorkspaceId(input.workspaceId)) {
      await this.workspaces.ensureFormWorkspace(
        PERSONAL_WORKSPACE_ID,
        "Personal",
      );
    }
    const workspace = (await this.state.listWorkspaces()).find(
      (item) => item.id === input.workspaceId,
    );
    if (!workspace) throw new Error(`Workspace ${input.workspaceId} not found`);
    const existing = await this.state.getSession(input.id);
    if (
      existing &&
      this.runs.hasActiveRun(input.id) &&
      (existing.agentType !== input.agentType ||
        existing.worktreePath !== input.worktreePath)
    ) {
      throw new Error(
        "Stop the session before changing its agent or working path",
      );
    }
    const session = applySessionConfiguration(
      input,
      existing,
      new Date().toISOString(),
    );
    await this.state.saveSession(session);
    return session;
  }

  async getSession(sessionId: string) {
    validateSessionId(sessionId);
    return this.state.getSession(sessionId);
  }

  async getLatestSessionReply(sessionId: string) {
    validateSessionId(sessionId);
    return this.state.getLatestReply(sessionId);
  }

  async setSessionPeerInbound(sessionId: string, policy: "deliver" | "refuse") {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, async () => {
      const session = await this.state.getSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} was not found`);
      const updated: SessionRecord = {
        ...session,
        peerInbound: policy,
        updatedAt: new Date().toISOString(),
      };
      await this.state.saveSession(updated);
      this.events.emit("daemon.event", {
        type: "data.changed",
        areas: ["agent"],
      });
      return updated;
    });
  }

  private async getSessionExecutionContext(
    sessionId: string,
  ): Promise<SessionExecutionContext> {
    validateSessionId(sessionId);
    const session = await this.state.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} was not found`);
    if (session.archivedAt)
      throw new Error("Restore the session before sending messages");
    return { session, ...(await this.requireWorkspacePaths(sessionId)) };
  }

  getSessionRuntimeState(sessionId: string) {
    validateSessionId(sessionId);
    return this.sessionRuntimeStates.get(sessionId);
  }

  private assertNotPersonalHome(sessionId: string) {
    if (this.personalAgents.ownsHomeSession(sessionId)) {
      throw new Error("A personal agent's home thread cannot be removed");
    }
  }

  async deleteSession(sessionId: string) {
    this.assertNotPersonalHome(sessionId);
    await this.removeSession(sessionId);
  }

  private async removeSession(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    if (!session) {
      return;
    }
    if (isChatSession(session)) {
      try {
        await Promise.race([
          this.memory.saveSession({ sessionId }),
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 45_000);
            timer.unref?.();
          }),
        ]);
      } catch (error) {
        logDaemonDiagnostic("warn", "memory.deleteCaptureFailed", {
          error: errorMessage(error, "Unknown error"),
          sessionId,
        });
      }
    }
    this.sessionRuntimeStates.forget(sessionId);
    await this.team.onLeadStopped(sessionId);
    await this.scriptRuns.cancelForRequester(sessionId);

    const providerSession = await this.state.getProviderSession(
      sessionId,
      session.agentType,
    );
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === session.workspaceId,
    );
    const workspaceRootPath = workspace
      ? resolveSessionWorkingPath({
          workspaceRootPath: primaryWorkspaceRootPath(workspace),
          worktreePath: session.worktreePath,
        })
      : undefined;
    await this.disposeSessionRuntime(sessionId);
    this.runtime.clearSessionPlan(sessionId);

    if (providerSession?.providerSessionId) {
      await deleteAgentProviderSession(
        session.agentType,
        providerSession.providerSessionId,
      );
    }

    await this.state.deleteSession(sessionId);
    await this.workspaceChanges.deleteSessionCheckpoints(
      sessionId,
      workspaceRootPath,
    );
    await this.worktrees.releaseSessionWorktree(session, workspace);
    this.announceSessionsChanged();
  }

  async forkSession(payload: ForkSessionPayload): Promise<SessionRecord> {
    validateSessionId(payload.sessionId);
    const source = await this.state.getSession(payload.sessionId);
    if (!source) throw new Error(`Session ${payload.sessionId} was not found`);
    if (isChatSession(source))
      throw new Error("Chat sessions cannot be forked");
    const [messages, queuedInputs] = await Promise.all([
      this.state.listMessagesBySessionId(source.id),
      this.state.listQueuedAgentInputs(source.id),
    ]);
    const queuedIds = new Set(queuedInputs.map((input) => input.messageId));
    const settled = messages.filter((message) => !queuedIds.has(message.id));
    const runs = this.state.listRunsBySessionId(source.id);
    const activeRun = this.runs.hasActiveRun(source.id)
      ? [...runs].reverse().find((run) => run.status === "running")
      : undefined;
    const { included, userTurnCount } = resolveForkPoint({
      settled,
      throughMessageId: payload.throughMessageId,
      activeTriggerMessageId: activeRun?.triggerMessageId ?? null,
    });
    const now = new Date().toISOString();
    const forkId = crypto.randomUUID();
    const fork: SessionRecord = {
      ...source,
      id: forkId,
      title: payload.title?.trim() || source.title,
      sessionKind: isPersonalSession(source) ? "personal" : "main",
      parentSessionId: null,
      parentToolCallId: null,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: included.at(-1)?.createdAt ?? null,
      archivedAt: null,
      importedProviderSessionId: null,
      importedAt: null,
    };
    const copies = included.map(
      (message): MessageRecord => ({
        ...message,
        id: crypto.randomUUID(),
        sessionId: forkId,
        runId: null,
        seq: undefined,
      }),
    );
    const agentOf = messageAgentLookup(runs);
    const sourceAgentTypes = [
      ...new Set(
        included.flatMap((message) => {
          const agent = agentOf(message);
          return agent ? [agent] : [];
        }),
      ),
    ];
    this.state.createForkedSession(fork, copies, {
      id: crypto.randomUUID(),
      kind: "fork",
      sourceSessionId: source.id,
      targetSessionId: forkId,
      sourceMessageId: included.at(-1)?.id ?? null,
      sourceAgentTypes:
        sourceAgentTypes.length > 0 ? sourceAgentTypes : [source.agentType],
      targetAgentType: null,
      status: "pending",
      strategy: null,
      coveredMessageCount: 0,
      handoffText: null,
      consumedByMessageId: null,
      createdAt: now,
      consumedAt: null,
    });
    const { workspaceRootPath } = await this.getSessionExecutionContext(
      source.id,
    );
    await forkProviderThreads(
      {
        getProviderSession: (sessionId, agentType) =>
          this.state.getProviderSession(sessionId, agentType),
        saveProviderSession: (agentType, record) =>
          this.state.saveProviderSession(agentType, record),
        forkProviderSession: (agentType, forkPayload) =>
          this.runtime.forkProviderSession(agentType, forkPayload),
      },
      {
        sourceSessionId: source.id,
        targetSessionId: forkId,
        workspaceRootPath,
        userTurnCount,
        agentTypes: [source.agentType, ...sourceAgentTypes],
        messages: included,
        runs,
      },
    );
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["agent"],
    });
    return fork;
  }

  async switchSessionAgent(sessionId: string, agentType: AgentId) {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, async () => {
      const session = await this.state.getSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} was not found`);
      if (session.archivedAt) {
        throw new Error("Restore the session before switching its agent");
      }
      if (isChatSession(session)) {
        throw new Error("Chat sessions cannot switch agents");
      }
      if (session.agentType === agentType) return session;
      if (this.runs.hasActiveRun(sessionId)) {
        throw new Error("Stop the session before switching its agent");
      }
      await this.agents.ensureAvailable(agentType);
      const updated: SessionRecord = {
        ...session,
        agentType,
        providerSnapshot: null,
        sessionModeId: null,
        permissionMode: undefined,
        updatedAt: new Date().toISOString(),
      };
      await this.state.saveSession(updated);
      this.events.emit("daemon.event", {
        type: "data.changed",
        areas: ["agent"],
      });
      return updated;
    });
  }

  listContextTransfers(sessionId: string) {
    validateSessionId(sessionId);
    return this.state.listContextTransfers(sessionId);
  }

  async updateSessionTitle(payload: UpdateSessionTitlePayload) {
    const updatedSession = await this.state.updateSessionTitle(
      payload.sessionId,
      payload.title,
      {
        expectedTitle: payload.expectedTitle,
        updatedAt: payload.updatedAt,
      },
    );
    if (!updatedSession || updatedSession.title !== payload.title) {
      return updatedSession;
    }

    try {
      await this.runtime.setSessionTitle(payload.sessionId, payload.title);
    } catch (error) {
      logDaemonDiagnostic("warn", "[SessionTitle] Native sync failed", {
        error: error instanceof Error ? error.message : String(error),
        sessionId: payload.sessionId,
      });
    }
    return updatedSession;
  }

  async setSessionPinned(payload: SetSessionPinnedPayload) {
    validateSessionId(payload.sessionId);
    const pinnedAt = payload.pinned ? new Date().toISOString() : null;
    const session = await this.state.setSessionPinned(
      payload.sessionId,
      pinnedAt,
    );
    if (session) {
      this.events.emit("daemon.event", {
        type: "data.changed",
        areas: ["agent"],
      });
    }
    return session;
  }

  async refineSessionTitle(
    payload: RefineSessionTitlePayload,
  ): Promise<SessionRecord | null> {
    const session = await this.getSession(payload.sessionId);
    if (!session || session.title !== payload.expectedTitle) {
      return session;
    }
    const title = await this.generateSessionTitle(session, payload);
    if (!title || title === payload.expectedTitle) {
      return session;
    }
    return this.updateSessionTitle({
      sessionId: payload.sessionId,
      title,
      expectedTitle: payload.expectedTitle,
    });
  }

  private async generateSessionTitle(
    session: SessionRecord,
    payload: RefineSessionTitlePayload,
  ) {
    try {
      const runtimeTitle = await this.runtime.generateSessionTitle(
        session.id,
        payload.message,
      );
      if (runtimeTitle !== undefined) return runtimeTitle;
    } catch (error) {
      logDaemonDiagnostic("info", "titleGeneration.skipped", {
        error: error instanceof Error ? error.message : String(error),
        sessionId: session.id,
      });
      return null;
    }
    return generateProviderSessionTitle(
      {
        state: this.state,
        readApiKey: (providerId) =>
          this.providerCredentials.readApiKey(providerId),
        resolveSessionProvider: (target) =>
          this.providerCredentials.forSession(target),
      },
      session,
      payload,
    );
  }

  async listSessionSlashCommands(
    agentType: AgentId,
    workspaceRootPath: string,
  ) {
    if (await this.agents.isAgentDisabled(agentType)) {
      return [];
    }
    return this.runtime.listSessionSlashCommands(agentType, workspaceRootPath);
  }

  async undoTurnChanges(input: UndoTurnChangesInput) {
    const { workspaceRootPath } = await this.requireWorkspacePaths(
      input.sessionId,
    );
    return this.workspaceChanges.undo({
      ...input,
      workspaceRootPath,
    });
  }

  async getToolCallResult(input: GetToolCallResultInput) {
    if (!isToolCallId(input?.toolCallId)) {
      throw new Error("Invalid tool call ID");
    }
    return this.state.getToolCallResult(input.toolCallId);
  }

  async getTurnChangeFile(input: TurnChangeFileContentRequest) {
    const { workspaceRootPath } = await this.requireWorkspacePaths(
      input.sessionId,
    );
    return this.workspaceChanges.getFileContent({
      ...input,
      workspaceRootPath,
    });
  }

  async listTurnChangeSets(sessionId: string) {
    const byMessage = await this.workspaceChanges.listBySession(sessionId);
    return Object.values(byMessage)
      .filter(
        (changeSet) =>
          changeSet.files.length > 0 &&
          changeSet.status !== "collecting" &&
          changeSet.status !== "error",
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getTurnChangeDiff(input: TurnChangeDiffRequest) {
    const { workspaceRootPath } = await this.requireWorkspacePaths(
      input.sessionId,
    );
    return this.workspaceChanges.getDiff({
      ...input,
      workspaceRootPath,
    });
  }

  async sendSessionMessage(command: SendSessionCommand) {
    validateSendSessionCommand(command);
    if (!command.origin) this.peerMessaging.noteHumanInput(command.sessionId);
    return this.submitSessionMessage(command);
  }

  private async deliverTeammateReport(report: TeammateReportCommand) {
    const sender = await this.state.getSession(report.fromSessionId);
    const hold = report.delivery === "hold";
    return this.submitSessionMessage(
      {
        sessionId: report.toSessionId,
        messageId: report.messageId,
        content: report.content,
        delivery:
          report.delivery === "hold" ? "queue-after-run" : report.delivery,
        origin: {
          kind: "peer",
          sessionId: report.fromSessionId,
          sessionTitle: sender?.title ?? report.fromSessionId,
        },
      },
      { hold },
    );
  }

  private submitSessionMessage(
    command: SendSessionCommand,
    { hold = false } = {},
  ) {
    const submittedAt = performance.now();
    return this.sessionCommands.run(command.sessionId, async () => {
      const startedAt = performance.now();
      const existing = await this.state.getMessageById(command.messageId);
      if (existing) return resolveRepeatedSend(existing, command);
      const accepted = await this.acceptSessionMessage(command, { hold });
      await this.dataService.linkAttachedIssues(
        command.sessionId,
        command.attachments,
      );
      const acceptedAt = performance.now();
      if (acceptedAt - submittedAt >= SLOW_REQUEST_THRESHOLD_MS) {
        logDaemonDiagnostic("warn", "session.sendSlow", {
          sessionId: command.sessionId,
          queuedMs: Math.round(startedAt - submittedAt),
          acceptMs: Math.round(acceptedAt - startedAt),
        });
      }
      return accepted;
    });
  }

  private async acceptSessionMessage(
    command: SendSessionCommand,
    { dequeued = false, hold = false } = {},
  ) {
    let payload: SessionRuntimeMessage = {
      ...command,
      ...(await this.getSessionExecutionContext(command.sessionId)),
    };
    if (this.stopping) throw new Error("Daemon is shutting down");
    const providerConfig = await this.providerCredentials.forSession(
      payload.session,
    );
    if (this.stopping) throw new Error("Daemon is shutting down");
    const sessionId = payload.session.id;
    const decision = decideDelivery({
      requested: payload.delivery,
      hasActiveRun: this.runs.hasActiveRun(sessionId),
      fromPeer: payload.origin?.kind === "peer",
      hold,
    });
    if (decision.kind === "reject") {
      throw new Error(
        decision.reason === "active-run"
          ? `Session ${sessionId} already has an active turn`
          : `Session ${sessionId} has no active turn`,
      );
    }
    if (decision.kind === "start") {
      payload = { ...payload, delivery: "start-new-run" };
    }
    const heldForCapacity =
      decision.kind === "start" &&
      !dequeued &&
      (await this.runCapacity.mustWait(payload.session));

    if (decision.kind === "steer") {
      const agent = await this.agents.ensureAvailable(
        payload.session.agentType,
      );
      if (!agent.capabilities.supportsSteering) {
        throw new Error(
          `${agent.label} does not support steering active turns.`,
        );
      }
      payload = await this.refreshSessionWorkingPath(payload);
      const createdMessage: MessageRecord = {
        ...this.createUserMessage(payload),
        runId: this.runs.activeRunId(sessionId),
      };
      const userMessage = await this.state.saveUserMessage(createdMessage);
      this.announceSessionsChanged();
      void this.runs.track(
        this.dispatchSteeringMessage(payload, userMessage, providerConfig),
      );
      return userMessage;
    }

    if (decision.kind === "queue" || heldForCapacity) {
      await this.agents.ensureAvailable(payload.session.agentType);
      if (!hold) await this.queuedFollowUps.load(sessionId);
      payload = await this.refreshSessionWorkingPath(payload);
      const createdMessage = this.createUserMessage(payload);
      const userMessage = await this.state.saveQueuedUserMessage(
        createdMessage,
        {
          messageId: createdMessage.id,
          sessionId: createdMessage.sessionId,
          workspaceRootPath: payload.workspaceRootPath,
          thinkingLevel: payload.thinkingLevel,
          createdAt: createdMessage.createdAt,
        },
      );
      this.queuedFollowUps.append(
        {
          ...payload,
          messageId: userMessage.id,
          createdAt: userMessage.createdAt,
        },
        { onlyIfLoaded: hold },
      );
      if (heldForCapacity) this.runCapacity.hold(sessionId);
      this.announceSessionsChanged();
      return userMessage;
    }

    await this.agents.ensureAvailable(payload.session.agentType);
    payload = await this.refreshSessionWorkingPath(payload);
    const createdMessage = this.createUserMessage(payload);
    if (dequeued) {
      await this.state.moveMessageToEnd(createdMessage.id, sessionId);
    }
    const savedMessage = await this.state.saveUserMessage(createdMessage);
    this.announceSessionsChanged();
    const persistence: RuntimePersistence = {
      ...(await this.createRuntimePersistence(payload.session)),
      providerConfig,
    };
    if (this.stopping) throw new Error("Daemon is shutting down");
    const run = await this.runs.start(
      sessionId,
      savedMessage.id,
      payload.session.agentType,
    );
    await this.runCapacity.armDeadline(payload.session, run.runId);
    const userMessage: MessageRecord = { ...savedMessage, runId: run.runId };
    try {
      this.runtime.createSessionRuntime(payload, persistence);
    } catch (error) {
      await this.runs.settle(run, {
        kind: "rejected",
        error: errorMessage(error, "Unknown agent runtime error"),
      });
      throw error;
    }

    void this.runs.track(
      dispatchSessionTurn({
        state: this.state,
        runtime: this.runtime,
        workspaceChanges: this.workspaceChanges,
        worktrees: this.worktrees,
        payload,
        userMessage,
        signal: run.signal,
        persistence,
        prepareStartContext: (session, message, history, persistence) =>
          this.prepareStartContext(session, message, history, persistence),
      }).then(
        (message) => this.runs.settle(run, { kind: "resolved", message }),
        (error: unknown) => {
          const message = errorMessage(error, "Unknown agent runtime error");
          logDaemonDiagnostic("error", "session.backgroundSendFailed", {
            agentType: payload.session.agentType,
            error: message,
            sessionId,
          });
          this.runtime.emitAgentEvent({ type: "error", sessionId, message });
          return this.runs.settle(run, { kind: "rejected", error: message });
        },
      ),
    );

    return userMessage;
  }

  async waitForSessionTurn(
    sessionId: string,
  ): Promise<SessionTurnOutcome | null> {
    try {
      await this.runCapacity.whenAdmitted(sessionId);
    } catch {
      return { status: "cancelled" };
    }
    return this.runs.outcomeOf(sessionId);
  }

  private async activeAgentTypes() {
    const sessions = await Promise.all(
      this.runs.activeRuns().map((run) => this.state.getSession(run.sessionId)),
    );
    return sessions.flatMap((session) => (session ? [session.agentType] : []));
  }

  private async expireRun(sessionId: string, runId: string, reason: string) {
    await this.sessionCommands.run(sessionId, async () => {
      if (!(await this.runs.expire(sessionId, runId, reason))) return;
      await this.workspaceChanges.failTurn(sessionId, "interrupted");
      await this.runtime.cancelSessionTurn(sessionId);
    });
  }

  async resumeQueuedSession(sessionId: string) {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, () =>
      this.restoreQueuedSession(sessionId),
    );
  }

  private async restoreQueuedSession(sessionId: string) {
    if (this.runs.hasActiveRun(sessionId) || this.stopping) return false;
    if (!(await this.queuedFollowUps.load(sessionId))) return false;
    return this.dispatchNextQueuedInput(sessionId);
  }

  updateQueuedAgentInput(
    sessionId: string,
    messageId: string,
    content: string,
  ) {
    return this.queuedFollowUps.update(sessionId, messageId, content);
  }

  deleteQueuedAgentInput(sessionId: string, messageId: string) {
    return this.queuedFollowUps.delete(sessionId, messageId);
  }

  async steerQueuedAgentInput(sessionId: string, messageId: string) {
    if (!this.runs.hasActiveRun(sessionId)) {
      return this.sendQueuedAgentInputNow(sessionId, messageId);
    }

    const { item, message: queuedMessage } =
      await this.queuedFollowUps.requireInput(sessionId, messageId);

    const agent = await this.agents.ensureAvailable(
      item.payload.session.agentType,
    );
    if (!agent.capabilities.supportsSteering) {
      throw new Error(`${agent.label} does not support steering active turns.`);
    }

    const message = await this.state.moveSteeredMessageToEnd(
      queuedMessage,
      this.runs.activeRunId(sessionId),
    );
    const history = await loadDispatchHistory(this.state, sessionId, messageId);
    const persistence = await this.createRuntimePersistence(
      item.payload.session,
    );
    await this.runtime.sendSessionMessage(
      {
        ...item.payload,
        content: message.content,
        attachments: message.attachments,
        delivery: "steer-active-run",
      },
      {
        ...persistence,
        history,
        providerConfig: await this.providerCredentials.forSession(
          (await this.getSessionExecutionContext(sessionId)).session,
        ),
      },
    );

    await this.state.deleteQueuedAgentInput(messageId);
    this.queuedFollowUps.remove(sessionId, messageId);
    this.runtime.emitAgentEvent({
      type: "message.completed",
      sessionId,
      message,
    });
    return message;
  }

  async sendQueuedAgentInputNow(sessionId: string, messageId: string) {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, async () => {
      const { message } = await this.queuedFollowUps.requireInput(
        sessionId,
        messageId,
      );

      if (this.runs.hasActiveRun(sessionId)) {
        throw new Error(
          "Cannot send a queued message while the current turn is running.",
        );
      }

      this.queuedFollowUps.promote(sessionId, messageId);

      const dispatched = await this.dispatchNextQueuedInput(sessionId);
      if (!dispatched) {
        throw new Error(`Queued message ${messageId} could not be sent`);
      }
      return message;
    });
  }

  private async startNextQueuedFollowUp(sessionId: string) {
    return this.sessionCommands.run(sessionId, () =>
      this.dispatchNextQueuedInput(sessionId),
    );
  }

  private async dispatchNextQueuedInput(sessionId: string): Promise<boolean> {
    if (this.stopping) return false;
    if (this.runs.hasActiveRun(sessionId)) return false;

    const next = this.queuedFollowUps.take(sessionId);
    if (!next) return false;

    try {
      const userMessage = await this.acceptSessionMessage(
        {
          sessionId,
          messageId: next.payload.messageId,
          createdAt: next.payload.createdAt,
          content: next.payload.content,
          attachments: next.payload.attachments,
          thinkingLevel: next.payload.thinkingLevel,
          delivery: next.payload.delivery,
          origin: next.payload.origin,
        },
        { dequeued: true },
      );
      await this.state.deleteQueuedAgentInput(next.payload.messageId);
      this.runtime.emitAgentEvent({
        type: "message.completed",
        sessionId,
        message: userMessage,
      });
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown queued input error";
      this.runtime.emitAgentEvent({ type: "error", sessionId, message });
      return this.dispatchNextQueuedInput(sessionId);
    }
  }

  setSessionRuntimeMode(sessionId: string, modeId: string) {
    return this.runtime.setSessionRuntimeMode(sessionId, modeId);
  }

  setSessionRuntimeConfigOption(
    sessionId: string,
    configId: string,
    value: boolean | string,
  ) {
    return this.runtime.setSessionRuntimeConfigOption(
      sessionId,
      configId,
      value,
    );
  }

  async stopSession(sessionId: string) {
    validateSessionId(sessionId);
    await this.team.onLeadStopped(sessionId);
    await this.scriptRuns.cancelForRequester(sessionId);
    return this.sessionCommands.run(sessionId, () =>
      this.stopSessionTurn(sessionId),
    );
  }

  private async stopTeammateSession(sessionId: string) {
    await this.stopSession(sessionId);
    await this.sessionCommands.run(sessionId, async () => {
      const inputs = await this.state.listQueuedAgentInputs(sessionId);
      for (const input of inputs) {
        await this.state.deleteQueuedUserMessage(input.messageId);
      }
      this.queuedFollowUps.forget(sessionId);
      if (inputs.length > 0) {
        this.events.emit("daemon.event", {
          type: "data.changed",
          areas: ["agent"],
        });
      }
    });
  }

  private async stopSessionTurn(sessionId: string) {
    this.runCapacity.release(sessionId, new Error("Session was stopped"));
    const stopped = this.runs.stop(sessionId);
    await this.workspaceChanges.failTurn(sessionId, "interrupted");
    await Promise.all([stopped, this.runtime.cancelSessionTurn(sessionId)]);
    return null;
  }

  private async disposeSessionRuntime(sessionId: string) {
    this.runCapacity.release(sessionId, new Error("Session was closed"));
    const stopped = this.runs.stop(sessionId);
    this.queuedFollowUps.forget(sessionId);
    await Promise.all([stopped, this.runtime.disposeSessionRuntime(sessionId)]);
  }

  resolvePermission(requestId: string, optionId: string) {
    return this.runtime.resolveAgentPermission(requestId, optionId);
  }

  resolveQuestion(questionId: string, answer: string) {
    return this.runtime.resolveAgentQuestion(questionId, answer);
  }

  resolvePlanApproval(approvalId: string, decision: AgentPlanApprovalDecision) {
    return this.runtime.resolveAgentPlanApproval(approvalId, decision);
  }

  private async createRuntimePersistence(
    session: Pick<SessionRecord, "id" | "agentType">,
  ): Promise<RuntimePersistence> {
    const { agentType, id: sessionId } = session;
    const providerSession = await this.state.getProviderSession(
      sessionId,
      agentType,
    );

    return {
      providerSession,
      onProviderSessionUpdate: (nextProviderSession) => {
        if (!nextProviderSession) {
          void this.state.clearProviderSession(sessionId, agentType);
          return;
        }
        void this.state.saveProviderSession(agentType, nextProviderSession);
      },
    };
  }

  private async performShutdown() {
    this.stopping = true;
    await this.startupRecovery;
    this.routines.stop();
    this.outbox.stop();
    clearInterval(this.checkpointReconcileTimer);
    this.keepAwake.dispose();
    this.runCapacity.close(new Error("Daemon is shutting down"));
    const interrupted = await this.runs.interruptAll();
    await this.state.noteRestartInterruptions(
      interrupted.map((run) => run.sessionId),
    );
    this.queuedFollowUps.clear();
    await this.scriptRuns.shutdown();
    await this.delegations.dispose();
    this.remoteHosts.dispose();
    try {
      const results = await Promise.allSettled([
        this.runtime.shutdown(),
        this.acpRegistry.ready,
        Promise.resolve().then(() => this.searchService.dispose()),
        this.applications.dispose(),
        Promise.resolve().then(() => this.mcp.dispose()),
        this.terminals.dispose(),
        Promise.resolve().then(() => this.workspaces.close()),
      ]);
      await this.runs.drainBackground();
      await this.runtime.flushEvents();
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length)
        throw new AggregateError(failures, "Daemon shutdown failed");
    } finally {
      this.state.close();
      this.events.removeAllListeners();
    }
  }

  private async refreshSessionWorkingPath(
    payload: SessionRuntimeMessage,
  ): Promise<SessionRuntimeMessage> {
    return {
      ...payload,
      ...(await this.requireWorkspacePaths(payload.session.id)),
    };
  }

  private async requireWorkspacePaths(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} was not found`);
    }
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === session.workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${session.workspaceId} not found`);
    }
    const workspaceRootPath = resolveSessionWorkingPath({
      workspaceRootPath: primaryWorkspaceRootPath(workspace),
      worktreePath: session.worktreePath,
    });
    return {
      workspaceRootPath,
      workspaceRootPaths: normalizeWorkspaceRootPaths([
        ...workspace.rootPaths,
        workspaceRootPath,
      ]),
    };
  }

  private createUserMessage(payload: SessionRuntimeMessage): MessageRecord {
    return {
      id: payload.messageId,
      sessionId: payload.session.id,
      role: "user",
      content: payload.content.trim(),
      attachments: payload.attachments ?? [],
      createdAt: payload.createdAt ?? new Date().toISOString(),
      ...(payload.origin ? { origin: payload.origin } : {}),
    };
  }

  private async prepareStartContext(
    session: SessionRecord,
    userMessage: MessageRecord,
    history: MessageRecord[],
    persistence: RuntimePersistence,
  ) {
    const pending = this.state.findPendingContextTransfer(session.id);
    const runs = this.state.listRunsBySessionId(session.id);
    const priorMessages = history.filter(
      (message) => message.id !== userMessage.id,
    );
    const chatSession = isChatSession(session);
    const sessionKind = session.sessionKind ?? "main";
    const persona = this.personalAgents.personaForSession(session);
    if (sessionKind === "personal" && !persona)
      throw new Error("Personal assistant memory scope is unavailable.");
    const memoryGate = await this.memory.beginTurn({
      sessionId: session.id,
      mode: chatSession ? "chat" : "agent",
      enforce:
        !chatSession &&
        sessionKind !== "personal" &&
        sessionKind !== "subagent",
    });
    const memoryContext =
      !chatSession && sessionKind === "subagent"
        ? null
        : await this.memory.buildTurnContext(
            session,
            userMessage.content,
            chatSession ? "chat" : "agent",
            persona ? personaMemoryScope(persona.id).read : null,
            priorMessages,
          );
    const resolution = resolveStartContext({
      targetAgentType: session.agentType,
      priorMessages,
      runs,
      hasProviderThread: persistence.providerSession !== null,
      pendingFork: pending?.kind === "fork",
    });
    const personaRole = persona
      ? await this.state.getAgentRole(persona.roleId)
      : null;
    const routine = this.routines.runningRoutine(session.id);
    const systemSections = persona
      ? {
          ...personaSystemSections({
            instructions: personaRole?.instructions ?? null,
            soul: persona.soul,
            userAddress: persona.userAddress,
          }),
          ...(routine
            ? { [ROUTINE_RUN_SECTION]: routineRunSection(routine) }
            : {}),
        }
      : undefined;
    const runPolicy = routine ? routineRunPolicy(routine.access) : null;
    const memoryPrefix = [memoryGate, memoryContext?.brief]
      .filter((section): section is string => Boolean(section))
      .join("\n\n");
    const memoryText = memoryPrefix ? `${memoryPrefix}\n\n` : "";
    if (resolution.kind === "native") {
      if (pending?.kind === "fork") {
        this.consumeNativeFork(pending, session, userMessage, priorMessages);
      }
      return {
        content: `${memoryText}${userMessage.content}`,
        history: persona
          ? history.filter((message) => !isPostedMessage(message))
          : history,
        contextHandoff: undefined,
        systemSections,
        runPolicy,
        postedMessages: persona ? postedMessagesSinceReply(priorMessages) : [],
      };
    }
    const sourceSessionId =
      resolution.transferKind === "fork"
        ? (pending?.sourceSessionId ?? null)
        : null;
    const items = await collectHandoffItems(this.sessionActivityReader(), {
      targetSessionId: session.id,
      targetAgentType: session.agentType,
      messages: resolution.messages,
      runs,
      fork: sourceSessionId ? pending : null,
    });
    const handoff = buildContextHandoffText({
      transferKind: resolution.transferKind,
      strategy: resolution.strategy,
      items,
      budget: contextHandoffBudget({
        contextWindow: session.providerSnapshot?.modelContextWindow,
        currentText: userMessage.content,
        currentAttachments: userMessage.attachments,
      }),
      sessionId: session.id,
      sourceSessionId,
    });
    const handoffText = handoff.text;
    const consumedAt = new Date().toISOString();
    const consumption = {
      targetAgentType: session.agentType,
      sourceAgentTypes:
        resolution.sourceAgentTypes.length > 0
          ? resolution.sourceAgentTypes
          : (pending?.sourceAgentTypes ?? []),
      strategy: resolution.strategy,
      coveredMessageCount: resolution.messages.length,
      handoffText,
      consumedByMessageId: userMessage.id,
      consumedAt,
    };
    if (pending && resolution.transferKind === "fork") {
      this.state.consumeContextTransfer(pending.id, consumption);
    } else {
      this.state.insertContextTransfer({
        id: crypto.randomUUID(),
        kind: "agent_switch",
        sourceSessionId: session.id,
        targetSessionId: session.id,
        sourceMessageId: priorMessages.at(-1)?.id ?? null,
        status: "consumed",
        createdAt: consumedAt,
        ...consumption,
      });
    }
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["agent"],
    });
    return {
      content: `${memoryText}${userMessage.content}`,
      history: resolution.freshProviderThread ? [userMessage] : history,
      contextHandoff: {
        text: handoff.text,
        preamble: handoff.preamble,
        entries: handoff.entries,
      },
      systemSections,
      runPolicy,
      postedMessages: [],
    };
  }

  private async personaMemoryScopeFor(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    const persona = session
      ? this.personalAgents.personaForSession(session)
      : null;
    if (session?.sessionKind === "personal" && !persona)
      throw new Error("Personal assistant memory scope is unavailable.");
    return persona ? personaMemoryScope(persona.id) : null;
  }

  private sessionActivityReader(): SessionActivityReader {
    return {
      listMessages: (id) => this.state.listMessagesBySessionId(id),
      listToolCalls: (id) => this.state.listToolCallsBySessionId(id),
      listRuns: (id) => this.state.listRunsBySessionId(id),
      listTransfers: (id) => this.state.listContextTransfers(id),
    };
  }

  private consumeNativeFork(
    transfer: ContextTransferRecord,
    session: SessionRecord,
    userMessage: MessageRecord,
    priorMessages: readonly MessageRecord[],
  ) {
    this.state.consumeContextTransfer(transfer.id, {
      targetAgentType: session.agentType,
      sourceAgentTypes: transfer.sourceAgentTypes,
      strategy: "native",
      coveredMessageCount: priorMessages.filter(isHandoffVisibleMessage).length,
      handoffText: null,
      consumedByMessageId: userMessage.id,
      consumedAt: new Date().toISOString(),
    });
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["agent"],
    });
  }

  private async dispatchSteeringMessage(
    payload: SessionRuntimeMessage,
    userMessage: MessageRecord,
    providerConfig: AgentRuntimeProviderConfig | null,
  ) {
    try {
      const history = await this.state.listMessagesBySessionId(
        payload.session.id,
      );
      const persistence = await this.createRuntimePersistence(payload.session);
      await this.runtime.sendSessionMessage(
        {
          ...payload,
          content: userMessage.content,
          attachments: userMessage.attachments,
        },
        { ...persistence, history, providerConfig },
      );
    } catch (error) {
      if (error instanceof AgentSteeringUnavailableError) {
        await this.queueSteeringFallback(payload, userMessage);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unknown steering error";
      this.runtime.emitAgentEvent({
        type: "error",
        sessionId: payload.session.id,
        message,
      });
    }
  }

  private async queueSteeringFallback(
    payload: SessionRuntimeMessage,
    userMessage: MessageRecord,
  ) {
    await this.state.enqueueQueuedAgentInput({
      messageId: userMessage.id,
      sessionId: userMessage.sessionId,
      workspaceRootPath: payload.workspaceRootPath,
      thinkingLevel: payload.thinkingLevel,
      createdAt: userMessage.createdAt,
    });
    this.queuedFollowUps.append(
      {
        ...payload,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
      },
      { chronological: true },
    );
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["agent"],
    });
    if (!this.runs.hasActiveRun(payload.session.id)) {
      void this.startNextQueuedFollowUp(payload.session.id);
    }
  }
}

export function onAgentEvent(
  service: CocurdexDaemonService,
  listener: (event: AgentEvent) => void,
) {
  const daemonListener = (event: CocurdexDaemonEvent) => {
    if (isAgentEvent(event) && !("conversationId" in event)) {
      listener(event);
    }
  };
  service.events.on("daemon.event", daemonListener);
  return () => {
    service.events.off("daemon.event", daemonListener);
  };
}
