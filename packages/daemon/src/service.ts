import { EventEmitter } from "node:events";
import { statSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import os, { homedir } from "node:os";
import path from "node:path";
import {
  deleteOpenCodeSession,
  readAdapterRateLimits as probeAdapterRateLimits,
  resetAcpProviderModelsCache,
} from "@cocurdex/agent-adapters";
import { loginPiProvider } from "@cocurdex/agent-adapters/provider-auth";
import {
  AgentSteeringUnavailableError,
  createAgentRegistry,
  detectAgentInstallations,
} from "@cocurdex/agent-core";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type {
  AcpRegistryAgentId,
  AgentEvent,
  AgentId,
  AgentPlanApprovalDecision,
  AgentRoleRecord,
  AgentRunLimits,
  AgentRuntimeProviderConfig,
  AppBootstrapData,
  ArchiveSessionsResult,
  CocurdexDaemonEvent,
  CommitMessageModelSelection,
  ContextTransferRecord,
  CreateSessionPayload,
  CreateWorkflowPayload,
  ForkSessionPayload,
  GetToolCallResultInput,
  GitCommitResult,
  MemorySettings,
  MessageRecord,
  NetworkProxySettings,
  QueuedAgentInputRecord,
  RefineSessionTitlePayload,
  SaveAgentRolePayload,
  SaveWorkflowDefinitionPayload,
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
  WorkspaceRecord,
  WorkspaceWorktreeEnvironment,
  WorktreeSettings,
} from "@cocurdex/shared";
import {
  AGENT_RUN_LIMITS_SETTING_KEY,
  buildContextHandoffText,
  buildPolicy,
  CHAT_WORKSPACE_ID,
  contextHandoffBudget,
  emptyWorktreeEnvironment,
  getNetworkProxySettings,
  type HostPrincipal,
  isAgentEvent,
  isAgentId,
  isAssistantSessionId,
  isChatSession,
  isChatWorkspaceId,
  isFeatureEnabled,
  isHandoffVisibleMessage,
  isSessionRuntimeEvent,
  isToolCallId,
  MEMORY_SETTINGS_KEY,
  type MessageAttachment,
  messageAgentLookup,
  newAssistantSessionId,
  normalizeAgentRoleAvatar,
  normalizeAgentRoleDescription,
  normalizeAgentRoleName,
  normalizeWorkspaceActions,
  normalizeWorkspaceRootPaths,
  PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  parseAgentRunLimits,
  primaryWorkspaceRootPath,
  principalHasScope,
  resolveSessionWorkingPath,
  resolveStartContext,
  resolveStoredAgentRunLimits,
  toolMayMutateWorkspace,
  validateSendSessionCommand,
  validateSessionConfiguration,
  validateSessionId,
  workspacePathsEqual,
} from "@cocurdex/shared";
import { resolveAuthorizedPdfReadPath } from "@cocurdex/shared/node";
import { AcpRegistryService, AgentAuthService } from "./acp-registry";
import {
  AgentToolBridge,
  registerHistoryTools,
  registerMemoryTools,
  registerMessagingTools,
  registerScriptRunTools,
  registerSettingsTools,
  registerTeamTools,
  requireCatalogEntry,
  WORKTREE_ENVIRONMENT_KEY,
} from "./agent-tools";
import {
  discoverAgentSessionModes,
  discoverInstalledAgentCapabilities,
} from "./agents";
import { DaemonAttachmentStore } from "./attachment-store";
import { DaemonCommitMessageService } from "./commit-message";
import { DaemonDataService } from "./data-service";
import { DaemonDeckService, DeckAssetStore } from "./decks";
import { logDaemonDiagnostic } from "./diagnostics";
import { loadExecutionTree } from "./execution-tree";
import { listHostDirectories } from "./fs-browse";
import { commitGitChanges } from "./git";
import {
  HostAccessService,
  LOCAL_REQUEST_CONTEXT,
  listHostAddresses,
} from "./host-access";
import {
  createHostKeyStore,
  type HostKeyStore,
} from "./host-access/host-key-store";
import { DaemonMcpService } from "./mcp-service";
import { MemoryService } from "./memory";
import { probeNetworkProxy } from "./network-proxy-probe";
import {
  assertTestableNetworkProxySettings,
  readNetworkProxySettings,
  saveNetworkProxySettings,
} from "./network-proxy-settings";
import { removeAppManagedWorktree } from "./orchestration-workspace";
import { DaemonPdfAnnotationsService } from "./pdf-annotations";
import { PeerMessagingService } from "./peer-messaging";
import { DaemonProviderService } from "./provider";
import { CodexLoginSessions } from "./provider/codex-login";
import { withServerProviderConnection } from "./provider/server-connection";
import { generateProviderSessionTitle } from "./provider/session-title";
import {
  ProviderCredentials,
  ProviderLoginSessions,
} from "./provider-credentials";
import { SLOW_REQUEST_THRESHOLD_MS } from "./rpc-request-log";
import { AgentRuntimeManager, type RuntimePersistence } from "./runtime";
import { createWorkspaceScanPolicy } from "./scan-roots";
import { ScriptRunModule } from "./script-run";
import { DaemonSearchService } from "./search-service";
import {
  applySessionConfiguration,
  collectHandoffItems,
  decideDelivery,
  forkProviderThreads,
  RunCapacity,
  type RunHandle,
  readSessionActivity,
  resolveForkPoint,
  resolveRepeatedSend,
  type SessionActivityReader,
  SessionCommandQueue,
  type SessionExecutionContext,
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
import {
  listFontFamilies,
  openDirectoryInFileManager,
  revealPathInFileManager,
} from "./system";
import { TeamModule, type TeammateReportCommand } from "./team";
import { TerminalService } from "./terminal";
import {
  DaemonWorkflowAgentTurnRunner,
  type DecideWorkflowGateInput,
  RuntimeWorkflowActionExecutor,
  WorkflowModule,
  WorkflowWorker,
  WorkflowWorkerScheduler,
} from "./workflow";
import {
  createWorkspaceChangeCoordinator,
  type WorkspaceChangeCoordinator,
} from "./workspace-changes";
import { resolveWorkspaceOpenPath } from "./workspace-open-path";
import {
  fileExists,
  listWorkspaceDirectory as listWorkspaceDirectoryOnDisk,
  listWorkspaceEntries as listWorkspaceEntriesOnDisk,
  listWorkspaceFiles as listWorkspaceFilesOnDisk,
  readTextFile,
} from "./workspace-service";
import { WorkspaceWatchService } from "./workspace-watch";
import {
  createManagedWorktree,
  listManagedWorktrees,
  loadWorktreeSettings,
  removeManagedWorktree,
  resolveWorktreeRepoRootPath,
  runWorktreeCleanup,
  saveWorktreeSettings,
} from "./worktree-management";
import { runWorktreeLifecycleScript } from "./worktree-script";
import { WorktreeSetupRuns, waitForWorktreeSetup } from "./worktree-setup-runs";

export interface CocurdexDaemonServiceOptions {
  runtimeFingerprint: string;
  socketPath?: string;
  startedAt?: string;
  userDataPath: string;
  agentToolsUrl?: string;
  localToken?: string;
  autoStartMemory?: boolean;
}

export interface CocurdexDaemonStatus {
  hostId: string;
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

interface QueuedFollowUp {
  payload: SessionRuntimeMessage & { messageId: string };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** How often checkpoint retention runs on a daemon that never restarts. */
const CHECKPOINT_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REPORTED_SETTING_VALUES_KEY = "settings.reportedValues";

function isExistingDirectory(directoryPath: string) {
  try {
    return statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

export class CocurdexDaemonService {
  readonly events = new EventEmitter();
  readonly agentTools: AgentToolBridge;
  readonly peerMessaging: PeerMessagingService;
  readonly team: TeamModule;
  readonly scriptRuns: ScriptRunModule;
  readonly dataService: DaemonDataService;
  readonly decks: DaemonDeckService;
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
  readonly pdfAnnotationsService: DaemonPdfAnnotationsService;
  readonly attachments: DaemonAttachmentStore;
  readonly codexLogins = new CodexLoginSessions();
  private readonly workspaceWatch: WorkspaceWatchService;
  readonly runtime: AgentRuntimeManager;
  readonly searchService: DaemonSearchService;
  readonly terminals: TerminalService;
  readonly skillsService: DaemonSkillsService;
  readonly skillLibrary: DaemonSkillLibraryService;
  readonly state: DaemonState;
  readonly hostAccess: HostAccessService;
  readonly hostAccessReady: Promise<void>;
  readonly workflows: WorkflowModule;
  readonly workspaceChanges: WorkspaceChangeCoordinator;
  private readonly scanPolicy: ReturnType<typeof createWorkspaceScanPolicy>;
  private readonly runtimeFingerprint: string;
  private readonly socketPath: string;
  private readonly startedAt: string;
  private readonly userDataPath: string;
  readonly hostKeys: HostKeyStore;
  private readonly sessionCommands = new SessionCommandQueue();
  readonly runs: SessionRunCoordinator;
  private readonly worktreeSetups = new WorktreeSetupRuns();
  private readonly queuedFollowUps = new Map<string, QueuedFollowUp[]>();
  private readonly sessionRuntimeStates = new SessionRuntimeStates();
  private readonly runCapacity: RunCapacity;
  private readonly workflowWorkerScheduler: WorkflowWorkerScheduler;
  private shutdownPromise: Promise<void> | null = null;
  private readonly checkpointReconcileTimer: NodeJS.Timeout;

  constructor(options: CocurdexDaemonServiceOptions) {
    this.runtimeFingerprint = options.runtimeFingerprint;
    this.socketPath = options.socketPath ?? "";
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.userDataPath = options.userDataPath;
    this.state = new DaemonState(options.userDataPath);
    this.hostKeys = createHostKeyStore(options.userDataPath);
    this.hostAccess = new HostAccessService({
      localToken: options.localToken ?? crypto.randomUUID(),
      hostKey: () => this.hostKeys.keys().noisePublicKey,
      repository: this.state.hostAccessStore.repository,
      settings: this.state.hostAccessStore.settings,
      hostName: () => os.hostname(),
      listAddresses: (port) => listHostAddresses(os.networkInterfaces(), port),
      remoteAccessAllowed: isFeatureEnabled(buildPolicy, "remote-access"),
      onRemoteAccessChanged: () => this.broadcastSettingsChanged(),
    });
    this.hostAccessReady = this.hostAccess.initialize();
    this.workflows = new WorkflowModule(this.state.workflows);
    this.dataService = new DaemonDataService(this.state, this.events);
    this.decks = new DaemonDeckService(
      this.state.data.decks,
      this.events,
      DeckAssetStore.open(options.userDataPath),
    );
    this.providerCredentials = new ProviderCredentials(
      this.state,
      options.userDataPath,
    );
    this.providerLogins = new ProviderLoginSessions(
      (providerId, method, interaction) =>
        loginPiProvider(options.userDataPath, providerId, method, interaction),
      (providerId) => this.providerCredentials.setApiKey(providerId, null),
    );
    this.acpRegistry = new AcpRegistryService(this.state, options.userDataPath);
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
    });
    this.scanPolicy = createWorkspaceScanPolicy(this.state);
    this.searchService = new DaemonSearchService({
      broadcast: (event) => this.events.emit("daemon.event", event),
      canScanRoot: (rootPath) => this.scanPolicy.canScan(rootPath),
    });
    this.terminals = new TerminalService({
      emit: (event) => this.events.emit("terminal.event", event),
      listWorkspaceRootPaths: () => this.listWorkspaceRootPaths(),
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
    this.attachments = new DaemonAttachmentStore(options.userDataPath);
    this.workspaceWatch = new WorkspaceWatchService((event) =>
      this.events.emit("daemon.event", event),
    );
    this.skillsService = new DaemonSkillsService(undefined, (rootPath) =>
      this.scanPolicy.canScan(rootPath),
    );
    this.skillLibrary = new DaemonSkillLibraryService({
      userDataPath: options.userDataPath,
      home: homedir(),
      settings: this.state.appSettings,
      listWorkspaces: () => this.state.listWorkspaces(),
    });
    this.pdfAnnotationsService = new DaemonPdfAnnotationsService(
      options.userDataPath,
      async () =>
        (await this.state.listWorkspaces()).flatMap(
          (workspace) => workspace.rootPaths,
        ),
    );
    this.agentTools = new AgentToolBridge({
      url: options.agentToolsUrl ?? null,
      getSession: (sessionId) => this.state.getSession(sessionId),
      getTeamId: (sessionId) => this.team.teamIdForSession(sessionId),
      getLeadRoster: (sessionId) => this.team.rosterForLead(sessionId),
      memoryInstructions: (hasMemoryTools) =>
        hasMemoryTools ? this.memory.agentInstructions(true) : undefined,
    });
    this.peerMessaging = new PeerMessagingService({
      getSession: (sessionId) => this.state.getSession(sessionId),
      listSessions: () => this.state.listSessions(),
      hasActiveTurn: (sessionId) => this.runs.hasActiveRun(sessionId),
      supportsSteering: (session) => this.agentSupportsSteering(session),
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
      supportsSteering: (session) => this.agentSupportsSteering(session),
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
      createWorktree: (input) => this.createWorktree(input),
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
    registerHistoryTools(this.agentTools.registry, {
      readSessionActivity: (caller, sessionId) =>
        readSessionActivity(
          this.sessionActivityReader(),
          caller.sessionId,
          sessionId,
        ),
    });
    registerMemoryTools(this.agentTools.registry, {
      isEnabled: () => this.memory.areToolsEnabledSync(),
      recall: (input) => this.memory.recall(input),
      show: (id) => this.memory.show(id),
      remember: (input) => this.memory.remember(input),
      policy: () => this.memory.policy(),
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
      createWorktree: (input) => this.createWorktree(input),
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      waitForSessionTurn: (sessionId) => this.waitForSessionTurn(sessionId),
      hasActiveTurn: (sessionId) => this.runs.hasActiveRun(sessionId),
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
    registerSettingsTools(this.agentTools.registry, {
      getWorktreeEnvironment: (workspaceId) =>
        this.getWorktreeEnvironment(workspaceId),
      proposeWorktreeEnvironment: (input) =>
        this.proposeWorktreeEnvironment(input),
      getSettingValue: (key, workspaceId) =>
        this.getSettingValue(key, workspaceId),
      setSettingValue: (input) => this.setSettingValue(input),
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
      readLimits: () => this.readAgentRunLimits(),
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
      resolveMcpServers: (agentId) => this.mcp.serversForAgent(agentId),
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
    // Retention only runs inside reconcile, so a long-lived daemon would never
    // expire checkpoints without this heartbeat.
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
      // Only a terminal error ends the turn; a mid-turn "error" event can be
      // followed by more tool calls whose changes still belong to this turn.
      if (event.type === "state.changed" && event.status === "error") {
        await this.workspaceChanges.failTurn(event.sessionId, "failed");
      }
      return persisted;
    });
    const workflowExecutor = new RuntimeWorkflowActionExecutor(
      new DaemonWorkflowAgentTurnRunner(
        this.state,
        this.runtime,
        this.runs,
        this.providerCredentials,
      ),
    );
    const workflowWorker = new WorkflowWorker(
      this.state.workflows,
      workflowExecutor,
      {
        workerId: `${this.runtimeFingerprint}:${process.pid}`,
        leaseDurationMs: 60_000,
        now: () => new Date().toISOString(),
        createId: () => crypto.randomUUID(),
      },
    );
    this.workflowWorkerScheduler = new WorkflowWorkerScheduler(workflowWorker, {
      concurrency: 4,
    });
    this.wakeWorkflowWorker();
    if (options.autoStartMemory === true) {
      void this.memory.initializeOnStartup();
    }
  }

  private async agentSupportsSteering(session: SessionRecord) {
    const agents = await this.listAgents(session.agentType);
    const agent = agents.find((item) => item.id === session.agentType);
    return agent?.capabilities.supportsSteering ?? false;
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
      await this.decks.collectUnusedImages();
    } catch {
      logDaemonDiagnostic("warn", "daemon.recoveryUnavailable");
    }
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
    await this.team.onLeadStopped(sessionId);
    await this.scriptRuns.cancelForRequester(sessionId);
    const session = await this.state.getSession(sessionId);
    if (session && isChatSession(session)) {
      void this.memory.saveSession({ sessionId });
    }
    return this.sessionCommands.run(sessionId, async () => {
      await this.stopSessionTurn(sessionId);
      this.queuedFollowUps.delete(sessionId);
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
      queuedInputs: [...this.queuedFollowUps.values()].reduce(
        (count, inputs) => count + inputs.length,
        0,
      ),
      workflowActive: this.workflowWorkerScheduler.isActive,
      workspaceSearches: this.searchService.activeCount,
    };
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
      workspaces: data.workspaces.map((workspace) => ({
        ...workspace,
        missingRootPaths: workspace.rootPaths.filter(
          (rootPath) => !isExistingDirectory(rootPath),
        ),
      })),
    };
  }

  async listAgents(only?: AgentId) {
    const descriptors = createAgentRegistry()
      .list()
      .filter((descriptor) => !only || descriptor.id === only);
    const agents = await detectAgentInstallations(descriptors);
    this.state.recordAgentVersions(agents);
    return discoverInstalledAgentCapabilities(agents, {
      cache: this.state.agentCapabilityCache,
    });
  }

  installAcpRegistryAgent(registryId: string) {
    return this.acpRegistry.install(registryId).then((agent) => {
      resetAcpProviderModelsCache(agent.agentId);
      return agent;
    });
  }

  installAcpRegistryCommand(params: {
    registryId: string;
    command: string;
    args: string[];
  }) {
    return this.acpRegistry
      .installCommand(params.registryId, params.command, params.args)
      .then((agent) => {
        resetAcpProviderModelsCache(agent.agentId);
        return agent;
      });
  }

  async uninstallAcpRegistryAgent(agentId: AcpRegistryAgentId) {
    await this.acpRegistry.uninstall(agentId);
    resetAcpProviderModelsCache(agentId);
    return null;
  }

  async readAgentSessionModes(agentId: AgentId) {
    const agents = await detectAgentInstallations(createAgentRegistry().list());
    this.state.recordAgentVersions(agents);
    return discoverAgentSessionModes(agents, {
      agentId,
      cache: this.state.agentCapabilityCache,
    });
  }

  readAdapterRateLimits(agentIds: AgentId[]) {
    return probeAdapterRateLimits(agentIds);
  }

  async testNetworkProxy(settings?: NetworkProxySettings) {
    if (settings) {
      assertTestableNetworkProxySettings(settings);
      await saveNetworkProxySettings(this.state, settings);
      this.broadcastSettingsChanged();
    }
    return probeNetworkProxy(getNetworkProxySettings());
  }

  getNetworkProxySettings() {
    return readNetworkProxySettings(this.state);
  }

  async setNetworkProxySettings(settings: NetworkProxySettings) {
    const saved = await saveNetworkProxySettings(this.state, settings);
    this.broadcastSettingsChanged();
    return saved;
  }

  listSessionAttention() {
    return this.state.sessionAttention.list();
  }

  updateSessionAttention(payload: UpdateSessionAttentionPayload) {
    return this.state.sessionAttention.update(payload);
  }

  async listWorkspaces() {
    const workspaces = await this.state.listWorkspaces();
    return workspaces.map((workspace) => ({
      ...workspace,
      missingRootPaths: workspace.rootPaths.filter(
        (rootPath) => !isExistingDirectory(rootPath),
      ),
    }));
  }

  async listWorkspaceEntries(rootPath: string) {
    if (!(await this.scanPolicy.canScan(rootPath))) {
      return [];
    }
    return listWorkspaceEntriesOnDisk(rootPath);
  }

  async listWorkspaceFiles(rootPath: string) {
    if (!(await this.scanPolicy.canScan(rootPath))) {
      return [];
    }
    await this.workspaceWatch.ensure(rootPath);
    return listWorkspaceFilesOnDisk(rootPath);
  }

  async listWorkspaceDirectory(rootPath: string, relativePath: string) {
    if (!(await this.scanPolicy.canScan(rootPath))) {
      return [];
    }
    return listWorkspaceDirectoryOnDisk(rootPath, relativePath);
  }

  async watchWorkspace(rootPath: string) {
    if (await this.scanPolicy.canScan(rootPath)) {
      await this.workspaceWatch.ensure(rootPath);
    }
  }

  async deleteWorkspace(workspaceId: string) {
    await this.state.deleteWorkspace(workspaceId);
    this.scanPolicy.invalidate();
  }

  async resolveWorkspaceOpenPath(inputPath: string, allowFile: boolean) {
    const workspaces = await this.state.listWorkspaces();
    return resolveWorkspaceOpenPath(
      inputPath,
      workspaces.flatMap((workspace) => workspace.rootPaths),
      { allowFile },
    );
  }

  // file.* RPCs are reachable by any daemon client, so reads are confined to
  // registered workspace/worktree roots instead of trusting request paths.
  async readWorkspaceTextFile(filePath: string) {
    if (!(await this.scanPolicy.canAccessFile(filePath))) {
      throw new Error(
        `File is outside every registered workspace (path=${filePath})`,
      );
    }
    return readTextFile(filePath);
  }

  async assertClientPathAccess(
    principal: HostPrincipal,
    filePath: string,
    target: "file" | "outputFile",
  ) {
    if (principal.kind === "local") return;
    const scope = target === "file" ? "files.read" : "files.write";
    if (!principalHasScope(principal, scope)) {
      throw new Error(`This device is missing the ${scope} scope`);
    }
    const checked =
      target === "outputFile" ? path.dirname(path.resolve(filePath)) : filePath;
    const exists =
      target === "file" ||
      (await stat(checked).then(
        (info) => info.isDirectory(),
        () => false,
      ));
    if (exists && (await this.scanPolicy.canAccessFile(checked))) return;
    throw new Error(
      `Path is outside every registered workspace (path=${filePath})`,
    );
  }

  async assertClientAttachmentsAccess(
    principal: HostPrincipal,
    attachments: readonly MessageAttachment[] | undefined,
  ) {
    if (principal.kind === "local") return;
    for (const attachment of attachments ?? []) {
      if (attachment.kind === "context-item") continue;
      if (attachment.kind === "image" || attachment.kind === "document") {
        if (this.attachments.isStoredFile(attachment)) continue;
        throw new Error(
          `Attachment is not a stored upload (path=${attachment.filePath})`,
        );
      }
      const filePath =
        attachment.kind === "context-folder"
          ? attachment.folderPath
          : attachment.filePath;
      await this.assertClientPathAccess(principal, filePath, "file");
    }
  }

  async resolveWorkspaceFilePath(filePath: string) {
    const resolvedPath = path.resolve(filePath);
    if (!(await this.scanPolicy.canAccessFile(resolvedPath))) {
      throw new Error(
        `File is outside every registered workspace (path=${resolvedPath})`,
      );
    }
    return resolvedPath;
  }

  async workspaceFileExists(filePath: string) {
    if (!(await this.scanPolicy.canAccessFile(filePath))) {
      return false;
    }
    return fileExists(filePath);
  }

  // Directory browsing for picking a workspace root is intentionally not
  // confined to scan roots: the whole point is choosing a new root. It lists
  // directory names only and is still gated by the daemon token.
  async listHostDirectories(directoryPath?: string) {
    return listHostDirectories(directoryPath);
  }

  homeDir() {
    return homedir();
  }

  listFontFamilies() {
    return listFontFamilies();
  }

  async openDirectoryInFileManager(directoryPath: string) {
    await openDirectoryInFileManager(directoryPath);
    return null;
  }

  async revealPathInFileManager(targetPath: string) {
    await revealPathInFileManager(targetPath);
    return null;
  }

  async resolvePdfPath(filePath: string) {
    return resolveAuthorizedPdfReadPath(
      filePath,
      await this.listWorkspaceRootPaths(),
    );
  }

  private async listWorkspaceRootPaths() {
    const workspaces = await this.state.listWorkspaces();
    return workspaces.flatMap((workspace) => workspace.rootPaths);
  }

  async commitWorkspaceChanges(input: {
    rootPath: string;
    message: string;
    includeUnstaged: boolean;
  }): Promise<GitCommitResult> {
    const generatedMessage = input.message.trim().length === 0;
    const message = generatedMessage
      ? await this.commitMessageService.generate({
          workspaceRootPath: input.rootPath,
          includeUnstaged: input.includeUnstaged,
        })
      : input.message;
    const result = await commitGitChanges(input.rootPath, {
      message,
      includeUnstaged: input.includeUnstaged,
    });
    return { ...result, generatedMessage };
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

  async saveWorkspace(workspace: WorkspaceRecord) {
    const rootPaths = normalizeWorkspaceRootPaths(workspace.rootPaths);
    if (rootPaths.length === 0) {
      throw new Error("Workspace requires at least one source folder");
    }
    const home = homedir();
    if (rootPaths.some((rootPath) => workspacePathsEqual(rootPath, home))) {
      throw new Error(
        "The home directory cannot be a workspace folder; choose a subfolder",
      );
    }
    if (rootPaths.some((rootPath) => path.parse(rootPath).root === rootPath)) {
      throw new Error(
        "A filesystem root cannot be a workspace folder; choose a subfolder",
      );
    }
    const others = (await this.state.listWorkspaces()).filter(
      (candidate) => candidate.id !== workspace.id,
    );
    const primaryRootPath = rootPaths[0];
    const conflict = others.find((candidate) =>
      workspacePathsEqual(candidate.rootPaths[0], primaryRootPath),
    );
    if (conflict) {
      throw new Error(
        `Folder ${primaryRootPath} is already the primary folder of workspace "${conflict.name}"`,
      );
    }
    const normalized = { ...workspace, rootPaths };
    try {
      await this.state.saveWorkspace(normalized);
    } finally {
      this.scanPolicy.invalidate();
    }
    return {
      ...normalized,
      missingRootPaths: normalized.rootPaths.filter(
        (rootPath) => !isExistingDirectory(rootPath),
      ),
    };
  }

  async getWorktreeEnvironment(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment> {
    const stored = await this.state.getWorktreeEnvironment(workspaceId);
    return stored ?? emptyWorktreeEnvironment(workspaceId);
  }

  async saveWorktreeEnvironment(
    environment: WorkspaceWorktreeEnvironment,
  ): Promise<WorkspaceWorktreeEnvironment> {
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === environment.workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${environment.workspaceId} not found`);
    }
    const next: WorkspaceWorktreeEnvironment = {
      workspaceId: environment.workspaceId,
      setupScript: environment.setupScript,
      cleanupScript: environment.cleanupScript,
      actions: normalizeWorkspaceActions(environment.actions),
      updatedAt: new Date().toISOString(),
      proposal: null,
    };
    await this.state.saveWorktreeEnvironment(next);
    return next;
  }

  private broadcastWorkspaceChanged() {
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["workspace"],
    });
  }

  async proposeWorktreeEnvironment(input: {
    workspaceId: string;
    setupScript: string;
    cleanupScript: string;
    rationale?: string | null;
  }): Promise<WorkspaceWorktreeEnvironment> {
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === input.workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${input.workspaceId} not found`);
    }
    await this.state.saveWorktreeEnvironmentProposal(input.workspaceId, {
      setupScript: input.setupScript,
      cleanupScript: input.cleanupScript,
      rationale: input.rationale?.trim() ? input.rationale.trim() : null,
      proposedAt: new Date().toISOString(),
    });
    this.broadcastWorkspaceChanged();
    return this.getWorktreeEnvironment(input.workspaceId);
  }

  private broadcastSettingsChanged() {
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: ["settings"],
    });
  }

  private async readDaemonSetting(key: string): Promise<unknown> {
    if (key === AGENT_RUN_LIMITS_SETTING_KEY) return this.readAgentRunLimits();
    if (key === MEMORY_SETTINGS_KEY) {
      return this.memory.getSettings();
    }
    if (key === "git.commitMessageModel") {
      return this.commitMessageService.getModelSetting();
    }
    throw new Error(`Settings key '${key}' is not readable yet`);
  }

  private async writeDaemonSetting(key: string, value: unknown): Promise<void> {
    if (key === AGENT_RUN_LIMITS_SETTING_KEY) {
      await this.setAgentRunLimits(value as AgentRunLimits);
      return;
    }
    if (key === MEMORY_SETTINGS_KEY) {
      await this.memory.setSettings(value as MemorySettings);
      return;
    }
    if (key === "git.commitMessageModel") {
      await this.commitMessageService.setModelSetting(
        value as CommitMessageModelSelection | null,
      );
      return;
    }
    throw new Error(`Settings key '${key}' is not writable yet`);
  }

  private async readReportedSettingValues(): Promise<Record<string, unknown>> {
    try {
      const raw = await this.state.getAppSetting(REPORTED_SETTING_VALUES_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  async reportSettingValues(values: Record<string, unknown>) {
    const mirror = await this.readReportedSettingValues();
    await this.state.setAppSetting(
      REPORTED_SETTING_VALUES_KEY,
      JSON.stringify({ ...mirror, ...values }),
    );
  }

  async getSettingValue(key: string, workspaceId: string) {
    const entry = requireCatalogEntry(key);
    if (entry.key === WORKTREE_ENVIRONMENT_KEY) {
      const environment = await this.getWorktreeEnvironment(workspaceId);
      return {
        value: {
          setupScript: environment.setupScript,
          cleanupScript: environment.cleanupScript,
        },
        pending: environment.proposal,
      };
    }
    if (entry.storage === "daemon") {
      return { value: await this.readDaemonSetting(entry.key), pending: null };
    }
    const mirror = await this.readReportedSettingValues();
    return { value: mirror[entry.key] ?? null, pending: null };
  }

  async setSettingValue(input: {
    key: string;
    value: unknown;
    workspaceId: string;
  }): Promise<{ status: "applied" | "queued" }> {
    const entry = requireCatalogEntry(input.key);
    if (entry.tier !== "write") {
      throw new Error(
        `Settings key '${entry.key}' cannot be set directly (tier=${entry.tier}); use settings_propose`,
      );
    }
    const value = entry.validate ? entry.validate(input.value) : input.value;
    if (entry.storage === "daemon") {
      await this.writeDaemonSetting(entry.key, value);
      this.broadcastSettingsChanged();
      return { status: "applied" };
    }
    await this.state.addPendingSettingsChange({
      id: crypto.randomUUID(),
      key: entry.key,
      value,
      createdAt: new Date().toISOString(),
    });
    this.broadcastSettingsChanged();
    return { status: "queued" };
  }

  listPendingSettingsChanges() {
    return this.state.listPendingSettingsChanges();
  }

  async acknowledgeSettingsChange(id: string) {
    await this.state.deletePendingSettingsChange(id);
  }

  async getOrCreateAssistantSession(input: { workspaceId: string }) {
    const existing = await this.mostRecentAssistantSession(input.workspaceId);
    if (!existing) {
      return this.createAssistantSession(input.workspaceId);
    }
    const snapshotSource = await this.assistantSnapshotSource(
      input.workspaceId,
      existing.agentType,
    );
    if (!existing.providerSnapshot && snapshotSource) {
      const updated: SessionRecord = {
        ...existing,
        providerSnapshot: snapshotSource,
        updatedAt: new Date().toISOString(),
      };
      await this.state.saveSession(updated);
      this.events.emit("daemon.event", {
        type: "data.changed",
        areas: ["agent"],
      });
      return updated;
    }
    return existing;
  }

  async createAssistantSession(workspaceId: string) {
    const agentType =
      (await this.mostRecentAssistantSession(workspaceId))?.agentType ??
      (await this.recentSessionAgentType(workspaceId)) ??
      (await this.defaultAssistantAgentId());
    return this.saveSessionConfiguration({
      id: newAssistantSessionId(),
      workspaceId,
      title: "Assistant",
      agentType,
      writeMode: "read-only",
      sessionModeId: null,
      permissionMode: undefined,
      agentRoleId: null,
      providerSnapshot: await this.assistantSnapshotSource(
        workspaceId,
        agentType,
      ),
      worktreePath: null,
      peerInbound: "refuse",
    });
  }

  private async mostRecentAssistantSession(
    workspaceId: string,
  ): Promise<SessionRecord | null> {
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === workspaceId,
    );
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    const sessions = await this.state.listSessions();
    return (
      sessions.find(
        (session) =>
          session.workspaceId === workspaceId &&
          isAssistantSessionId(session.id),
      ) ?? null
    );
  }

  private async recentSessionAgentType(
    workspaceId: string,
  ): Promise<AgentId | null> {
    const sessions = await this.state.listSessions();
    return (
      sessions.find((session) => session.workspaceId === workspaceId)
        ?.agentType ?? null
    );
  }

  private async assistantSnapshotSource(
    workspaceId: string,
    agentType: AgentId,
  ) {
    const sessions = await this.state.listSessions();
    return (
      sessions.find(
        (session) =>
          session.workspaceId === workspaceId &&
          session.agentType === agentType &&
          session.providerSnapshot,
      )?.providerSnapshot ?? null
    );
  }

  private async defaultAssistantAgentId(): Promise<AgentId> {
    const agent = (await this.listAgents()).find(
      (item) => item.availability === "available",
    );
    if (!agent) {
      throw new Error("No agent is available on this machine.");
    }
    return agent.id;
  }

  async runWorktreeSetup(input: {
    workspaceId: string;
    worktreePath: string;
  }): Promise<{ ran: boolean }> {
    const environment = await this.getWorktreeEnvironment(input.workspaceId);
    if (!environment.setupScript.trim()) {
      return { ran: false };
    }
    await runWorktreeLifecycleScript({
      script: environment.setupScript,
      cwd: input.worktreePath,
    });
    return { ran: true };
  }

  getWorktreeSettings() {
    return loadWorktreeSettings(this.state, this.userDataPath);
  }

  saveWorktreeSettings(settings: WorktreeSettings) {
    return saveWorktreeSettings(this.state, this.userDataPath, settings);
  }

  listManagedWorktrees() {
    return listManagedWorktrees({
      state: this.state,
      userDataPath: this.userDataPath,
    });
  }

  async createWorktree(input: {
    workspaceId: string;
    branch?: string;
    startPoint?: string;
  }) {
    this.scanPolicy.invalidate();
    try {
      return await createManagedWorktree({
        state: this.state,
        userDataPath: this.userDataPath,
        workspaceId: input.workspaceId,
        branch: input.branch,
        startPoint: input.startPoint,
        startSetup: async (worktreePath) => {
          const environment = await this.getWorktreeEnvironment(
            input.workspaceId,
          );
          const script = environment.setupScript.trim();
          if (script) {
            this.worktreeSetups.start(worktreePath, script, () =>
              runWorktreeLifecycleScript({ script, cwd: worktreePath }),
            );
          }
        },
      });
    } finally {
      this.scanPolicy.invalidate();
    }
  }

  async removeWorktree(input: {
    workspaceId: string;
    worktreePath: string;
    workspaceRootPath?: string;
  }) {
    this.scanPolicy.invalidate();
    try {
      return await removeManagedWorktree({
        state: this.state,
        userDataPath: this.userDataPath,
        workspaceId: input.workspaceId,
        worktreePath: input.worktreePath,
        workspaceRootPath: input.workspaceRootPath,
        runCleanup: async (worktreePath) => {
          try {
            await runWorktreeCleanup({
              state: this.state,
              workspaceId: input.workspaceId,
              worktreePath,
            });
          } catch (error) {
            logDaemonDiagnostic("warn", "worktree.cleanup failed", {
              error: error instanceof Error ? error.message : String(error),
              workspaceId: input.workspaceId,
              worktreePath,
            });
          }
        },
      });
    } finally {
      this.scanPolicy.invalidate();
    }
  }

  listSessions() {
    return this.state.listSessions();
  }

  listPendingInteractions() {
    return this.runtime.getPendingInteractions();
  }

  // Journal seq provider bound by the wire layer so resync snapshots can
  // report the position their reads are consistent with.
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

    const [
      messages,
      activeMessages,
      toolCalls,
      queuedAgentInputs,
      usage,
      turnChangeSets,
    ] = await Promise.all([
      this.state.listMessagesBySessionId(sessionId),
      this.state.listActiveMessagesBySessionId(sessionId),
      this.state.listToolCallsBySessionId(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
      this.state.getSessionUsage(sessionId),
      this.state.listTurnChangeSets(sessionId),
    ]);

    return {
      session,
      messages,
      activeMessages,
      toolCalls,
      queuedAgentInputs,
      activeRun: this.state.getActiveRun(sessionId),
      usage,
      turnChangeSets,
      interactions: this.runtime.getSessionInteractions(sessionId),
      plan: this.runtime.getSessionPlan(sessionId),
    };
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

  listWorkflowRuns() {
    return this.workflows.listRuns();
  }

  getWorkflowRun(workflowRunId: string) {
    return this.workflows.get(workflowRunId);
  }

  listAgentRoles() {
    return this.state.listAgentRoles();
  }

  getAgentRole(id: string) {
    return this.state.getAgentRole(id);
  }

  async saveAgentRole(payload: SaveAgentRolePayload): Promise<AgentRoleRecord> {
    const name = normalizeAgentRoleName(payload.name);
    if (!name) {
      throw new Error("Agent role name is required.");
    }
    if (!isAgentId(payload.agentId)) {
      throw new Error("Agent role adapter is invalid.");
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
      instructions: payload.instructions ?? null,
      skillIds: payload.skillIds ?? null,
      avatar:
        payload.avatar === undefined
          ? (existing?.avatar ?? null)
          : normalizeAgentRoleAvatar(payload.avatar),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.state.saveAgentRole(role);
    return role;
  }

  async deleteAgentRole(id: string) {
    await this.state.deleteAgentRole(id);
  }

  listWorkflowDefinitions() {
    return this.workflows.listDefinitions();
  }

  getWorkflowDefinition(definitionId: string) {
    return this.workflows.getDefinition(definitionId);
  }

  saveWorkflowDefinition(payload: SaveWorkflowDefinitionPayload) {
    return this.workflows.saveDefinition(payload);
  }

  duplicateWorkflowDefinition(definitionId: string) {
    return this.workflows.duplicateDefinition(definitionId);
  }

  async deleteWorkflowDefinition(definitionId: string) {
    await this.workflows.deleteDefinition(definitionId);
  }

  async createWorkflow(payload: CreateWorkflowPayload) {
    const definitionId =
      payload.definitionId ?? PLAN_EXECUTE_REVIEW_WORKFLOW_ID;
    const definition = await this.workflows.getDefinition(definitionId);
    const bindings = payload.bindings ?? definition?.defaultBindings;
    if (!bindings) {
      throw new Error("Workflow executor bindings are required.");
    }
    for (const binding of Object.values(bindings)) {
      const agent = await this.ensureAgentAvailable(binding.agentId);
      const requiredWriteMode =
        binding.permissionProfile === "read_only"
          ? "read-only"
          : "native-write";
      if (!agent.capabilities.writeModes.includes(requiredWriteMode)) {
        throw new Error(
          `${agent.label} cannot satisfy workflow permission profile '${binding.permissionProfile}'.`,
        );
      }
    }
    return this.workflows.create({ ...payload, bindings });
  }

  async startWorkflow(workflowRunId: string) {
    const aggregate = await this.workflows.start(workflowRunId);
    this.wakeWorkflowWorker();
    return aggregate;
  }

  async decideWorkflowGate(input: DecideWorkflowGateInput) {
    const aggregate = await this.workflows.decideGate(input);
    this.wakeWorkflowWorker();
    return aggregate;
  }

  async cancelWorkflow(workflowRunId: string) {
    const current = await this.workflows.get(workflowRunId);
    const aggregate = await this.workflows.cancel(workflowRunId);
    const activeSessionIds = new Set(
      current?.attempts
        .filter((attempt) => attempt.status === "running" && attempt.sessionId)
        .map((attempt) => attempt.sessionId as string) ?? [],
    );
    await Promise.all(
      Array.from(activeSessionIds, (sessionId) =>
        this.runtime.cancelSessionTurn(sessionId),
      ),
    );
    return aggregate;
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
      agents: await this.listAgents(),
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
    const session = await this.state.getSession(input.sessionId);
    if (!session) throw new Error(`Session ${input.sessionId} was not found.`);
    const agent = (await this.listAgents(session.agentType)).find(
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
    await this.ensureAgentAvailable(input.agentType);
    if (isChatWorkspaceId(input.workspaceId)) {
      await this.ensureChatWorkspace();
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

  private async ensureChatWorkspace() {
    const rootPath = path.join(this.userDataPath, "chat");
    await mkdir(rootPath, { recursive: true });
    const existing = (await this.state.listWorkspaces()).find(
      (workspace) => workspace.id === CHAT_WORKSPACE_ID,
    );
    if (existing && workspacePathsEqual(existing.rootPaths[0] ?? "", rootPath))
      return;
    const now = new Date().toISOString();
    await this.state.saveWorkspace({
      id: CHAT_WORKSPACE_ID,
      name: "Chat",
      rootPaths: [rootPath],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastOpenedAt: existing?.lastOpenedAt ?? now,
      sortOrder: existing?.sortOrder ?? 0,
    });
    this.scanPolicy.invalidate();
  }

  async getSession(sessionId: string) {
    validateSessionId(sessionId);
    return this.state.getSession(sessionId);
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

  async deleteSession(sessionId: string) {
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
      "opencode",
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
      await deleteOpenCodeSession({
        providerSessionId: providerSession.providerSessionId,
      });
    }

    await this.state.deleteSession(sessionId);
    await this.workspaceChanges.deleteSessionCheckpoints(
      sessionId,
      workspaceRootPath,
    );
    await this.releaseSessionWorktree(session, workspace);
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
      sessionKind: "main",
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
      await this.ensureAgentAvailable(agentType);
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

  // Only replaces a title the user has not changed since the request was
  // made: expectedTitle guards against overwriting a manual rename.
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
    if (session.agentType !== "claude-agent") {
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
    try {
      return await this.runtime.generateSessionTitle(
        session.id,
        payload.message,
      );
    } catch (error) {
      logDaemonDiagnostic("info", "titleGeneration.skipped", {
        error: error instanceof Error ? error.message : String(error),
        sessionId: session.id,
      });
      return null;
    }
  }

  listSessionSlashCommands(agentType: AgentId, workspaceRootPath: string) {
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
      const agent = await this.ensureAgentAvailable(payload.session.agentType);
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
      await this.ensureAgentAvailable(payload.session.agentType);
      if (!hold) await this.loadQueuedFollowUps(sessionId);
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
      const loaded = this.queuedFollowUps.get(sessionId);
      if (loaded || !hold) {
        const queued = loaded ?? [];
        queued.push({
          payload: {
            ...payload,
            messageId: userMessage.id,
            createdAt: userMessage.createdAt,
            delivery: "start-new-run",
          },
        });
        this.queuedFollowUps.set(sessionId, queued);
      }
      if (heldForCapacity) this.runCapacity.hold(sessionId);
      this.announceSessionsChanged();
      return userMessage;
    }

    await this.ensureAgentAvailable(payload.session.agentType);
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
      this.dispatchSessionMessage(payload, userMessage, run, persistence).then(
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

  getAgentRunLimits() {
    return this.readAgentRunLimits();
  }

  async setAgentRunLimits(value: AgentRunLimits) {
    const limits = parseAgentRunLimits(value);
    if (!limits) throw new Error("Agent run limits are out of range");
    await this.state.setAppSetting(
      AGENT_RUN_LIMITS_SETTING_KEY,
      JSON.stringify(limits),
    );
    this.broadcastSettingsChanged();
    return limits;
  }

  private async readAgentRunLimits() {
    return resolveStoredAgentRunLimits(
      await this.state.getAppSetting(AGENT_RUN_LIMITS_SETTING_KEY),
    );
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
    if (!(await this.loadQueuedFollowUps(sessionId))) return false;
    return this.dispatchNextQueuedInput(sessionId);
  }

  private async loadQueuedFollowUps(sessionId: string) {
    const loaded = this.queuedFollowUps.get(sessionId);
    if (loaded) return loaded;

    const [session, inputs, messages] = await Promise.all([
      this.state.getSession(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
      this.state.listMessagesBySessionId(sessionId),
    ]);
    if (!session || session.archivedAt || inputs.length === 0) return;

    const messageById = new Map(
      messages.map((message) => [message.id, message]),
    );
    const queued = inputs.flatMap((input): QueuedFollowUp[] => {
      const message = messageById.get(input.messageId);
      if (!message) return [];
      return [
        {
          payload: {
            session,
            workspaceRootPath: input.workspaceRootPath,
            messageId: message.id,
            createdAt: message.createdAt,
            content: message.content,
            attachments: message.attachments,
            thinkingLevel: input.thinkingLevel,
            delivery: "start-new-run",
          },
        },
      ];
    });
    if (queued.length === 0) return;

    this.queuedFollowUps.set(sessionId, queued);
    return queued;
  }

  async updateQueuedAgentInput(
    sessionId: string,
    messageId: string,
    content: string,
  ) {
    const trimmedContent = content.trim();
    const queued = await this.loadQueuedFollowUps(sessionId);
    const index = queued?.findIndex(
      (item) => item.payload.messageId === messageId,
    );
    if (!queued || index == null || index < 0) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const message = await this.state.getMessageById(messageId);
    if (
      !message ||
      message.sessionId !== sessionId ||
      message.role !== "user"
    ) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    // An image-only queued message has no text, so emptiness is only invalid
    // when the message carries no attachments either.
    if (!trimmedContent && message.attachments.length === 0) {
      throw new Error("Queued message cannot be empty");
    }

    const updatedMessage = { ...message, content: trimmedContent };
    await this.state.updateQueuedUserMessage(updatedMessage);
    queued[index] = {
      ...queued[index],
      payload: { ...queued[index].payload, content: trimmedContent },
    };
    return updatedMessage;
  }

  async deleteQueuedAgentInput(sessionId: string, messageId: string) {
    const queued = await this.loadQueuedFollowUps(sessionId);
    if (!queued) {
      throw new Error(`Queued message ${messageId} was not found`);
    }
    const nextQueued = queued.filter(
      (item) => item.payload.messageId !== messageId,
    );
    if (nextQueued.length === queued.length) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    await this.state.deleteQueuedUserMessage(messageId);
    if (nextQueued.length === 0) {
      this.queuedFollowUps.delete(sessionId);
    } else {
      this.queuedFollowUps.set(sessionId, nextQueued);
    }
  }

  async steerQueuedAgentInput(sessionId: string, messageId: string) {
    if (!this.runs.hasActiveRun(sessionId)) {
      return this.sendQueuedAgentInputNow(sessionId, messageId);
    }

    const queued = await this.loadQueuedFollowUps(sessionId);
    const index = queued?.findIndex(
      (item) => item.payload.messageId === messageId,
    );
    const item = index == null || index < 0 ? undefined : queued?.[index];
    if (!queued || !item || index == null || index < 0) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const queuedMessage = await this.state.getMessageById(messageId);
    if (
      !queuedMessage ||
      queuedMessage.sessionId !== sessionId ||
      queuedMessage.role !== "user"
    ) {
      throw new Error(`Queued message ${messageId} was not found`);
    }

    const agent = await this.ensureAgentAvailable(
      item.payload.session.agentType,
    );
    if (!agent.capabilities.supportsSteering) {
      throw new Error(`${agent.label} does not support steering active turns.`);
    }

    const message = await this.state.moveSteeredMessageToEnd(
      queuedMessage,
      this.runs.activeRunId(sessionId),
    );
    const [messages, queuedInputs] = await Promise.all([
      this.state.listMessagesBySessionId(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
    ]);
    const queuedMessageIds = new Set(
      queuedInputs.map((input) => input.messageId),
    );
    const history = messages.filter(
      (historyMessage) =>
        historyMessage.id === messageId ||
        !queuedMessageIds.has(historyMessage.id),
    );
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
    queued.splice(index, 1);
    if (queued.length === 0) {
      this.queuedFollowUps.delete(sessionId);
    }
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
      const queued = await this.loadQueuedFollowUps(sessionId);
      const index = queued?.findIndex(
        (item) => item.payload.messageId === messageId,
      );
      if (!queued || index == null || index < 0) {
        throw new Error(`Queued message ${messageId} was not found`);
      }

      const message = await this.state.getMessageById(messageId);
      if (
        !message ||
        message.sessionId !== sessionId ||
        message.role !== "user"
      ) {
        throw new Error(`Queued message ${messageId} was not found`);
      }

      if (this.runs.hasActiveRun(sessionId)) {
        await this.stopSessionTurn(sessionId);
      }

      const [item] = queued.splice(index, 1);
      queued.unshift(item);
      this.queuedFollowUps.set(sessionId, queued);

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

    const queued = this.queuedFollowUps.get(sessionId);
    const next = queued?.shift();
    if (!next) {
      this.queuedFollowUps.delete(sessionId);
      return false;
    }
    if (!queued || queued.length === 0) {
      this.queuedFollowUps.delete(sessionId);
    }

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

  /** User-facing stop: abandon the current turn, keep the agent session usable. */
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
      this.queuedFollowUps.delete(sessionId);
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
    this.queuedFollowUps.delete(sessionId);
    await Promise.all([stopped, this.runtime.disposeSessionRuntime(sessionId)]);
  }

  resolvePermission(requestId: string, optionId: string) {
    return this.runtime.resolveAgentPermission(requestId, optionId);
  }

  private async ensureAgentAvailable(agentId: AgentId) {
    const agents = await this.listAgents(agentId);
    const agent = agents.find((item) => item.id === agentId);

    if (agent?.availability === "available") {
      return agent;
    }

    throw new Error(
      `${agent?.label ?? agentId} is not available on this machine.`,
    );
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
    clearInterval(this.checkpointReconcileTimer);
    this.runCapacity.close(new Error("Daemon is shutting down"));
    const interrupted = await this.runs.interruptAll();
    await this.state.noteRestartInterruptions(
      interrupted.map((run) => run.sessionId),
    );
    this.queuedFollowUps.clear();
    await this.scriptRuns.shutdown();
    const schedulerClose = this.workflowWorkerScheduler.close();
    try {
      const results = await Promise.allSettled([
        this.runtime.shutdown(),
        schedulerClose,
        this.acpRegistry.ready,
        Promise.resolve().then(() => this.searchService.dispose()),
        Promise.resolve().then(() => this.mcp.dispose()),
        this.terminals.dispose(),
        Promise.resolve().then(() => this.workspaceWatch.close()),
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

  private wakeWorkflowWorker() {
    void this.workflowWorkerScheduler.wake().catch((error: unknown) => {
      logDaemonDiagnostic("error", "workflow.workerFailed", { error });
    });
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

  private async releaseSessionWorktree(
    session: SessionRecord,
    workspace: WorkspaceRecord | undefined,
  ) {
    const worktreePath = session.worktreePath?.trim();
    if (!worktreePath || !workspace) {
      return;
    }

    const [activeSessions, archivedSessions] = await Promise.all([
      this.state.listSessions(),
      this.state.listArchivedSessions(),
    ]);
    const stillBound = [...activeSessions, ...archivedSessions].some(
      (candidate) => candidate.worktreePath === worktreePath,
    );
    if (stillBound) {
      return;
    }

    const environment = await this.getWorktreeEnvironment(session.workspaceId);
    if (environment.cleanupScript.trim()) {
      try {
        await runWorktreeLifecycleScript({
          script: environment.cleanupScript,
          cwd: worktreePath,
        });
      } catch (error) {
        logDaemonDiagnostic("warn", "worktree.cleanup failed", {
          error: error instanceof Error ? error.message : String(error),
          sessionId: session.id,
          worktreePath,
        });
      }
    }

    const settings = await loadWorktreeSettings(this.state, this.userDataPath);
    const repoRootPath = await resolveWorktreeRepoRootPath(
      workspace,
      worktreePath,
    );
    await removeAppManagedWorktree({
      repoRootPath,
      worktreePath,
      userDataPath: this.userDataPath,
      worktreeRootPath: settings.rootPath,
    });
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

  private async dispatchSessionMessage(
    payload: SessionRuntimeMessage,
    userMessage: MessageRecord,
    run: RunHandle,
    persistence: RuntimePersistence,
  ) {
    const [messages, queuedInputs] = await Promise.all([
      this.state.listMessagesBySessionId(payload.session.id),
      this.state.listQueuedAgentInputs(payload.session.id),
    ]);
    const queuedMessageIds = new Set(
      queuedInputs.map((input) => input.messageId),
    );
    const history = messages.filter(
      (message) =>
        message.id === userMessage.id || !queuedMessageIds.has(message.id),
    );
    if (run.signal.aborted) {
      return null;
    }

    const worktreePath = payload.session.worktreePath?.trim();
    if (worktreePath) {
      await waitForWorktreeSetup({
        runs: this.worktreeSetups,
        sessionId: payload.session.id,
        worktreePath,
        cancelled: new Promise<void>((resolve) => {
          run.signal.addEventListener("abort", () => resolve(), { once: true });
        }),
        emit: (event) => this.runtime.emitAgentEvent(event),
      });
      if (run.signal.aborted) {
        return null;
      }
    }

    if (!isChatSession(payload.session)) {
      await this.workspaceChanges.beginTurn({
        sessionId: payload.session.id,
        userMessageId: userMessage.id,
        workspaceRootPath: payload.workspaceRootPath,
      });
    }

    if (run.signal.aborted) {
      await this.workspaceChanges.failTurn(payload.session.id, "interrupted");
      return null;
    }

    const start = await this.prepareStartContext(
      payload.session,
      userMessage,
      history,
      persistence,
    );
    return this.runtime.sendSessionMessage(
      {
        ...payload,
        content: start.content,
        attachments: userMessage.attachments,
      },
      {
        ...persistence,
        history: start.history,
        contextHandoff: start.contextHandoff,
      },
    );
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
    const memoryGate = await this.memory.beginTurn({
      sessionId: session.id,
      mode: chatSession ? "chat" : "agent",
      enforce: !chatSession && sessionKind !== "subagent",
    });
    const memoryContext =
      !chatSession && sessionKind === "subagent"
        ? null
        : await this.memory.buildTurnContext(
            session,
            userMessage.content,
            chatSession ? "chat" : "agent",
          );
    const memoryPrefix = [memoryGate, memoryContext?.brief]
      .filter((section): section is string => Boolean(section))
      .join("\n\n");
    const memoryText = memoryPrefix ? `${memoryPrefix}\n\n` : "";
    const resolution = resolveStartContext({
      targetAgentType: session.agentType,
      priorMessages,
      runs,
      hasProviderThread: persistence.providerSession !== null,
      pendingFork: pending?.kind === "fork",
    });
    if (resolution.kind === "native") {
      if (pending?.kind === "fork") {
        this.consumeNativeFork(pending, session, userMessage, priorMessages);
      }
      return {
        content: `${memoryText}${userMessage.content}`,
        history,
        contextHandoff: undefined,
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
    };
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
    const queued = this.queuedFollowUps.get(payload.session.id) ?? [];
    queued.push({
      payload: {
        ...payload,
        messageId: userMessage.id,
        createdAt: userMessage.createdAt,
        delivery: "start-new-run",
      },
    });
    queued.sort((left, right) =>
      (left.payload.createdAt ?? "").localeCompare(
        right.payload.createdAt ?? "",
      ),
    );
    this.queuedFollowUps.set(payload.session.id, queued);
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
