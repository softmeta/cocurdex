import { EventEmitter } from "node:events";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  deleteOpenCodeSession,
  readAdapterRateLimits as probeAdapterRateLimits,
} from "@cocurdex/agent-adapters";
import {
  AgentSteeringUnavailableError,
  createAgentRegistry,
  detectAgentInstallations,
} from "@cocurdex/agent-core";
import { IssueConflictError } from "@cocurdex/db";
import { DAEMON_PROTOCOL_VERSION } from "@cocurdex/rpc";
import type {
  AgentEvent,
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentRoleRecord,
  AgentRuntimeProviderConfig,
  AgentToolCallRecord,
  AppBootstrapData,
  AppResyncSnapshot,
  CocurdexDaemonEvent,
  CreateWorkflowPayload,
  GetToolCallResultInput,
  GitCommitResult,
  MessageRecord,
  SaveAgentRolePayload,
  SaveWorkflowDefinitionPayload,
  SendSessionCommand,
  SessionConfiguration,
  SessionMessagesResult,
  SessionRecord,
  SubmitPreviousMessageCommand,
  TurnChangeDiffRequest,
  TurnChangeFileContentRequest,
  UndoTurnChangesInput,
  UpdateSessionAttentionPayload,
  UpdateSessionTitlePayload,
  WorkspaceRecord,
  WorkspaceWorktreeEnvironment,
  WorktreeSettings,
} from "@cocurdex/shared";
import {
  emptyWorktreeEnvironment,
  getNetworkProxySettings,
  isAgentId,
  isToolCallId,
  isWorkspaceSearchDaemonEvent,
  normalizeAgentRoleName,
  normalizeWorkspaceRootPaths,
  PLAN_EXECUTE_REVIEW_WORKFLOW_ID,
  primaryWorkspaceRootPath,
  resolveSessionWorkingPath,
  toolMayMutateWorkspace,
  validateSendSessionCommand,
  validateSessionConfiguration,
  validateSessionId,
  validateSubmitPreviousMessageCommand,
  workspacePathsEqual,
} from "@cocurdex/shared";
import {
  AgentToolBridge,
  registerMessagingTools,
  registerTeamTools,
} from "./agent-tools";
import { discoverInstalledAgentCapabilities } from "./agents";
import { DaemonChatService } from "./chat";
import { DaemonCommitMessageService } from "./commit-message";
import { DaemonDataService } from "./data-service";
import { logDaemonDiagnostic } from "./diagnostics";
import { listHostDirectories } from "./fs-browse";
import { commitGitChanges } from "./git";
import { DaemonMcpConfigService } from "./mcp-config";
import { probeNetworkProxy } from "./network-proxy-probe";
import { removeAppManagedWorktree } from "./orchestration-workspace";
import { DaemonPdfAnnotationsService } from "./pdf-annotations";
import { PeerMessagingService } from "./peer-messaging";
import { DaemonProviderService } from "./provider";
import { ProviderCredentials } from "./provider-credentials";
import { AgentRuntimeManager, type RuntimePersistence } from "./runtime";
import { createWorkspaceScanPolicy } from "./scan-roots";
import { DaemonSearchService } from "./search-service";
import {
  applySessionConfiguration,
  SessionCheckpointStore,
  SessionCommandQueue,
  type SessionExecutionContext,
  type SessionRuntimeMessage,
} from "./session-control";
import { DaemonSkillsService } from "./skills-service";
import { DaemonState } from "./state";
import { TeamModule } from "./team";
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
import {
  fileExists,
  listWorkspaceEntries as listWorkspaceEntriesOnDisk,
  listWorkspaceFiles as listWorkspaceFilesOnDisk,
  readTextFile,
} from "./workspace-service";
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

export interface CocurdexDaemonServiceOptions {
  runtimeFingerprint: string;
  socketPath?: string;
  startedAt?: string;
  userDataPath: string;
  agentToolsEntryPath?: string;
}

export interface CocurdexDaemonStatus {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

interface QueuedFollowUp {
  payload: SessionRuntimeMessage & { messageId: string };
}

/** How often checkpoint retention runs on a daemon that never restarts. */
const CHECKPOINT_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isExistingDirectory(directoryPath: string) {
  try {
    return statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

export class CocurdexDaemonService {
  readonly chatService: DaemonChatService;
  readonly events = new EventEmitter();
  readonly agentTools: AgentToolBridge;
  readonly peerMessaging: PeerMessagingService;
  readonly team: TeamModule;
  readonly dataService: DaemonDataService;
  readonly providerService: DaemonProviderService;
  readonly providerCredentials: ProviderCredentials;
  private startupRecovery: Promise<void> | null = null;
  private stopping = false;
  readonly commitMessageService: DaemonCommitMessageService;
  readonly mcpConfigService: DaemonMcpConfigService;
  readonly pdfAnnotationsService: DaemonPdfAnnotationsService;
  readonly runtime: AgentRuntimeManager;
  readonly searchService: DaemonSearchService;
  readonly skillsService: DaemonSkillsService;
  readonly state: DaemonState;
  readonly workflows: WorkflowModule;
  readonly workspaceChanges: WorkspaceChangeCoordinator;
  private readonly scanPolicy: ReturnType<typeof createWorkspaceScanPolicy>;
  private readonly runtimeFingerprint: string;
  private readonly socketPath: string;
  private readonly startedAt: string;
  private readonly userDataPath: string;
  private readonly sessionCheckpoints: SessionCheckpointStore;
  private readonly sessionCommands = new SessionCommandQueue();
  private readonly pendingTurns = new Map<string, { cancelled: boolean }>();
  private readonly backgroundSends = new Set<Promise<unknown>>();
  private readonly queuedFollowUps = new Map<string, QueuedFollowUp[]>();
  private readonly workflowWorkerScheduler: WorkflowWorkerScheduler;
  private shutdownPromise: Promise<void> | null = null;
  private readonly checkpointReconcileTimer: NodeJS.Timeout;

  constructor(options: CocurdexDaemonServiceOptions) {
    this.runtimeFingerprint = options.runtimeFingerprint;
    this.socketPath = options.socketPath ?? "";
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.userDataPath = options.userDataPath;
    this.sessionCheckpoints = new SessionCheckpointStore(options.userDataPath);
    this.state = new DaemonState(options.userDataPath);
    this.chatService = new DaemonChatService({
      getDatabase: () => this.state.getChatDatabase(),
      broadcast: (event) => this.events.emit("daemon.event", event),
    });
    this.workflows = new WorkflowModule(this.state.workflows);
    this.dataService = new DaemonDataService(this.state, this.events);
    this.providerCredentials = new ProviderCredentials(
      this.state,
      options.userDataPath,
    );
    this.providerService = new DaemonProviderService(
      this.state,
      this.providerCredentials,
    );
    this.commitMessageService = new DaemonCommitMessageService(
      this.state,
      (snapshot) => this.providerCredentials.resolveSnapshot(snapshot),
    );
    this.scanPolicy = createWorkspaceScanPolicy(this.state);
    this.searchService = new DaemonSearchService({
      broadcast: (event) => this.events.emit("daemon.event", event),
      canScanRoot: (rootPath) => this.scanPolicy.canScan(rootPath),
    });
    this.mcpConfigService = new DaemonMcpConfigService(options.userDataPath);
    this.skillsService = new DaemonSkillsService(undefined, (rootPath) =>
      this.scanPolicy.canScan(rootPath),
    );
    this.pdfAnnotationsService = new DaemonPdfAnnotationsService(
      options.userDataPath,
      async () =>
        (await this.state.listWorkspaces()).flatMap(
          (workspace) => workspace.rootPaths,
        ),
    );
    this.agentTools = new AgentToolBridge({
      userDataPath: options.userDataPath,
      entryPath: options.agentToolsEntryPath ?? process.argv[1] ?? "",
      getSession: (sessionId) => this.state.getSession(sessionId),
      getTeamId: (sessionId) => this.team.teamIdForSession(sessionId),
    });
    this.peerMessaging = new PeerMessagingService({
      getSession: (sessionId) => this.state.getSession(sessionId),
      listSessions: () => this.state.listSessions(),
      hasActiveTurn: (sessionId) => this.pendingTurns.has(sessionId),
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      broadcast: (event) => this.events.emit("daemon.event", event),
      peerScope: (sessionId) => this.team.peerScope(sessionId),
    });
    this.team = new TeamModule({
      repository: this.state.teams,
      getSession: (sessionId) => this.state.getSession(sessionId),
      saveSession: (session) => this.state.saveSession(session),
      getAgentRole: (id) => this.state.getAgentRole(id),
      createIssueView: (input) => this.dataService.createIssueView(input),
      loadIssueView: (viewId) => this.dataService.loadIssueView({ viewId }),
      createIssue: (payload) => this.dataService.createIssue(payload),
      updateIssue: (payload) => this.dataService.updateIssue(payload),
      isIssueConflict: (error) => error instanceof IssueConflictError,
      sendSessionMessage: (command) => this.sendSessionMessage(command),
      sendPeerMessage: (payload, render) =>
        this.peerMessaging.send(payload, render),
      stopSession: (sessionId) => this.stopSession(sessionId),
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
    this.runtime = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => {
        this.events.emit("daemon.event", event);
      },
      userDataPath: options.userDataPath,
      agentTools: this.agentTools,
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
    this.runtime.configureAgentEventPersistence(async (event) => {
      await this.state.persistAgentEvent(event);
      await this.state.sessionAttention.applyEvent(event);
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
      }
      await this.team.onAgentEvent(event);
      // Only a terminal error ends the turn; a mid-turn "error" event can be
      // followed by more tool calls whose changes still belong to this turn.
      if (event.type === "state.changed" && event.status === "error") {
        await this.workspaceChanges.failTurn(event.sessionId, "failed");
      }
    });
    const workflowExecutor = new RuntimeWorkflowActionExecutor(
      new DaemonWorkflowAgentTurnRunner(
        this.state,
        this.runtime,
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
  }

  startBackgroundRecovery() {
    if (this.startupRecovery || this.stopping) return;
    this.startupRecovery = this.trackBackgroundSend(
      this.recoverQueuedSessions(),
    );
  }

  private async recoverQueuedSessions() {
    try {
      await this.state.waitForStartupRecovery();
      const inputs = await this.state.listAllQueuedAgentInputs();
      for (const sessionId of new Set(inputs.map((input) => input.sessionId))) {
        if (this.stopping) break;
        try {
          await this.resumeQueuedSession(sessionId);
        } catch {
          logDaemonDiagnostic("warn", "session.queueRecoveryFailed", {
            sessionId,
          });
        }
      }
    } catch {
      logDaemonDiagnostic("warn", "session.queueRecoveryUnavailable");
    }
  }

  async archiveSession(sessionId: string) {
    validateSessionId(sessionId);
    await this.team.onLeadStopped(sessionId);
    return this.sessionCommands.run(sessionId, async () => {
      await this.stopSessionTurn(sessionId);
      this.queuedFollowUps.delete(sessionId);
      return this.state.archiveSession(sessionId);
    });
  }

  async restoreSession(sessionId: string) {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, () =>
      this.state.restoreSession(sessionId),
    );
  }

  status(): CocurdexDaemonStatus {
    return {
      pid: process.pid,
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      runtimeFingerprint: this.runtimeFingerprint,
      socketPath: this.socketPath,
      startedAt: this.startedAt,
    };
  }

  getActiveWork() {
    return {
      agentTurns: Math.max(this.pendingTurns.size, this.backgroundSends.size),
      queuedInputs: [...this.queuedFollowUps.values()].reduce(
        (count, inputs) => count + inputs.length,
        0,
      ),
      chatOperations: this.chatService.activeOperationCount,
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
      workspaces: data.workspaces.map((workspace) => ({
        ...workspace,
        missingRootPaths: workspace.rootPaths.filter(
          (rootPath) => !isExistingDirectory(rootPath),
        ),
      })),
    };
  }

  async listAgents() {
    const agents = await detectAgentInstallations(createAgentRegistry().list());
    return discoverInstalledAgentCapabilities(agents);
  }

  readAdapterRateLimits(agentIds: AgentId[]) {
    return probeAdapterRateLimits(agentIds);
  }

  testNetworkProxy() {
    return probeNetworkProxy(getNetworkProxySettings());
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
    return listWorkspaceFilesOnDisk(rootPath);
  }

  invalidateScanRoots() {
    this.scanPolicy.invalidate();
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
  }

  async saveWorkspace(workspace: WorkspaceRecord) {
    const rootPaths = normalizeWorkspaceRootPaths(workspace.rootPaths);
    if (rootPaths.length === 0) {
      throw new Error("Workspace requires at least one source folder");
    }
    const home = homedir();
    if (rootPaths.some((rootPath) => workspacePathsEqual(rootPath, home))) {
      throw new Error(
        "The home directory cannot be a project folder; choose a subfolder",
      );
    }
    if (rootPaths.some((rootPath) => path.parse(rootPath).root === rootPath)) {
      throw new Error(
        "A filesystem root cannot be a project folder; choose a subfolder",
      );
    }
    const others = (await this.state.listWorkspaces()).filter(
      (candidate) => candidate.id !== workspace.id,
    );
    for (const rootPath of rootPaths) {
      const conflict = others.find((candidate) =>
        candidate.rootPaths.some((owned) =>
          workspacePathsEqual(owned, rootPath),
        ),
      );
      if (conflict) {
        throw new Error(
          `Folder ${rootPath} already belongs to project "${conflict.name}"`,
        );
      }
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
      updatedAt: new Date().toISOString(),
    };
    await this.state.saveWorktreeEnvironment(next);
    return next;
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
    branch: string;
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
        runSetup: async (worktreePath) => {
          await this.runWorktreeSetup({
            workspaceId: input.workspaceId,
            worktreePath,
          });
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

  // Full authoritative refresh after a replay gap. Reads run behind queued
  // event persistence, so every journaled event at or below the captured
  // eventSeq is already reflected here; clients must only apply newer
  // buffered events on top.
  async resync(sessionIds: string[]): Promise<AppResyncSnapshot> {
    return this.runtime.withEventPersistence(async () => {
      const eventSeq = this.readEventSeq();
      const data = await this.state.bootstrap();
      const transcripts = Object.fromEntries(
        await Promise.all(
          sessionIds.map(async (sessionId) => {
            const messages = (await this.state.callStorage(
              "message.listBySession",
              [sessionId],
            )) as SessionMessagesResult;
            const toolCalls = (await this.state.callStorage(
              "toolCall.listBySession",
              [sessionId],
            )) as AgentToolCallRecord[];
            return [
              sessionId,
              {
                messages: messages.messages,
                activeMessages:
                  this.state.listActiveMessagesBySessionId(sessionId),
                turnStats: messages.turnStats,
                turnChangeSets: messages.turnChangeSets,
                toolCalls,
              },
            ] as const;
          }),
        ),
      );
      return {
        epoch: this.startedAt,
        eventSeq,
        sessions: data.sessions,
        queuedAgentInputs: data.queuedAgentInputs,
        queuedMessages: data.queuedMessages,
        sessionUsage: data.sessionUsage,
        interactions: this.runtime.getPendingInteractions(),
        transcripts,
      };
    });
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
      usage,
      turnChangeSets,
      interactions: this.runtime.getSessionInteractions(sessionId),
    };
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
      collaborationMode: payload.collaborationMode ?? "default",
      reasoningEffort: payload.reasoningEffort,
      serviceTier: payload.serviceTier,
      fastMode: payload.fastMode,
      thinkingLevel: payload.thinkingLevel,
      openCodeAgent: payload.openCodeAgent,
      openCodeVariant: payload.openCodeVariant,
      instructions: payload.instructions ?? null,
      skillIds: payload.skillIds ?? null,
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

  async saveSessionConfiguration(input: SessionConfiguration) {
    validateSessionConfiguration(input);
    return this.sessionCommands.run(input.id, () =>
      this.configureSession(input),
    );
  }

  private async configureSession(input: SessionConfiguration) {
    await this.ensureAgentAvailable(input.agentType);
    const workspace = (await this.state.listWorkspaces()).find(
      (item) => item.id === input.workspaceId,
    );
    if (!workspace) throw new Error(`Workspace ${input.workspaceId} not found`);
    const existing = await this.state.getSession(input.id);
    if (
      existing &&
      this.pendingTurns.has(input.id) &&
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

  async deleteSession(sessionId: string) {
    const session = await this.state.getSession(sessionId);
    if (!session) {
      return;
    }
    await this.team.onLeadStopped(sessionId);

    const providerSession = await this.state.getProviderSession(sessionId);
    const workspace = (await this.state.listWorkspaces()).find(
      (candidate) => candidate.id === session.workspaceId,
    );
    const workspaceRootPath = workspace
      ? resolveSessionWorkingPath({
          workspaceRootPath: primaryWorkspaceRootPath(workspace),
          worktreePath: session.worktreePath,
        })
      : undefined;
    await this.workspaceChanges.deleteSessionCheckpoints(
      sessionId,
      workspaceRootPath,
    );
    await this.disposeSessionRuntime(sessionId);

    if (
      session.agentType === "opencode" &&
      providerSession?.providerSessionId
    ) {
      if (!workspaceRootPath) {
        throw new Error(`Workspace ${session.workspaceId} not found`);
      }
      await deleteOpenCodeSession({
        providerSessionId: providerSession.providerSessionId,
        workspaceRootPath,
      });
    }

    await this.state.deleteSession(sessionId);
    await this.releaseSessionWorktree(session, workspace);
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

  generateSessionTitle(sessionId: string, message: string) {
    return this.runtime.generateSessionTitle(sessionId, message);
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
    const database = await this.state.getChatDatabase();
    return database.toolCalls.getResultById(input.toolCallId);
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

  async getPreviousMessageCheckpointStatus(
    sessionId: string,
    messageId: string,
  ) {
    validateSessionId(messageId);
    const context = await this.getSessionExecutionContext(sessionId);
    const message = await this.state.getMessageById(messageId);
    if (!message || message.sessionId !== sessionId || message.role !== "user")
      return { available: false };
    return this.sessionCheckpoints.status({
      sessionId,
      messageId,
      workspaceRootPath: context.workspaceRootPath,
      workspaceRootPaths: context.workspaceRootPaths,
    });
  }

  async submitPreviousMessage(command: SubmitPreviousMessageCommand) {
    validateSubmitPreviousMessageCommand(command);
    return this.sessionCommands.run(command.sessionId, () =>
      this.resubmitMessage(command),
    );
  }

  private async resubmitMessage(command: SubmitPreviousMessageCommand) {
    const context = await this.getSessionExecutionContext(command.sessionId);
    const existing = await this.state.getMessageById(command.messageId);
    if (
      !existing ||
      existing.sessionId !== command.sessionId ||
      existing.role !== "user"
    ) {
      throw new Error("Previous user message not found");
    }
    await this.stopSessionTurn(command.sessionId);
    if (this.pendingTurns.has(command.sessionId))
      throw new Error("Session still has an active turn after stop");
    if (command.revertWorkspace) {
      await this.sessionCheckpoints.restore({
        sessionId: command.sessionId,
        messageId: command.messageId,
        workspaceRootPath: context.workspaceRootPath,
        workspaceRootPaths: context.workspaceRootPaths,
      });
    }
    const message: MessageRecord = {
      ...existing,
      content: command.content.trim(),
      attachments: command.attachments ?? [],
    };
    await this.rewindSession(message);
    return this.acceptSessionMessage({
      sessionId: command.sessionId,
      messageId: message.id,
      createdAt: message.createdAt,
      content: message.content,
      attachments: message.attachments,
    });
  }

  private async captureSessionCheckpoint(
    payload: SessionRuntimeMessage,
    message: MessageRecord,
  ) {
    await this.sessionCheckpoints
      .capture({
        sessionId: message.sessionId,
        messageId: message.id,
        workspaceRootPath: payload.workspaceRootPath,
        workspaceRootPaths: payload.workspaceRootPaths,
      })
      .catch((error: unknown) => {
        logDaemonDiagnostic("warn", "checkpoint.captureSkipped", {
          sessionId: message.sessionId,
          messageId: message.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  }

  private async rewindSession(message: MessageRecord) {
    if (this.pendingTurns.has(message.sessionId)) {
      throw new Error(
        `Session ${message.sessionId} still has an active turn after stop`,
      );
    }
    this.queuedFollowUps.delete(message.sessionId);
    await this.state.rewindSessionMessages(message);
    await this.state.deleteQueuedAgentInput(message.id);
  }

  async sendSessionMessage(command: SendSessionCommand) {
    validateSendSessionCommand(command);
    return this.sessionCommands.run(command.sessionId, async () => {
      if (
        command.messageId &&
        (await this.state.getMessageById(command.messageId))
      ) {
        throw new Error(
          "Message ID already exists; use the resubmit command to edit a previous message",
        );
      }
      return this.acceptSessionMessage(command);
    });
  }

  private async acceptSessionMessage(command: SendSessionCommand) {
    let payload: SessionRuntimeMessage = {
      ...command,
      ...(await this.getSessionExecutionContext(command.sessionId)),
    };
    if (this.stopping) throw new Error("Daemon is shutting down");
    const providerConfig = await this.providerCredentials.forSession(
      payload.session,
    );
    if (this.stopping) throw new Error("Daemon is shutting down");
    const isSteering = payload.delivery === "steer-active-run";
    const isQueuedFollowUp = payload.delivery === "queue-after-run";
    const hasActiveTurn = this.pendingTurns.has(payload.session.id);
    if (hasActiveTurn && !isSteering && !isQueuedFollowUp) {
      throw new Error(
        `Session ${payload.session.id} already has an active turn`,
      );
    }
    if (isSteering && !hasActiveTurn) {
      throw new Error(`Session ${payload.session.id} has no active turn`);
    }

    if (isSteering) {
      const agent = await this.ensureAgentAvailable(payload.session.agentType);
      if (!agent.capabilities.supportsSteering) {
        throw new Error(
          `${agent.label} does not support steering active turns.`,
        );
      }
      payload = await this.refreshSessionWorkingPath(payload);
      const userMessage = this.createUserMessage(payload);
      await this.captureSessionCheckpoint(payload, userMessage);
      await this.state.saveUserMessage(userMessage);
      void this.trackBackgroundSend(
        this.dispatchSteeringMessage(payload, userMessage, providerConfig),
      );
      return userMessage;
    }

    if (isQueuedFollowUp && hasActiveTurn) {
      await this.ensureAgentAvailable(payload.session.agentType);
      payload = await this.refreshSessionWorkingPath(payload);
      const userMessage = this.createUserMessage(payload);
      await this.state.saveQueuedUserMessage(userMessage, {
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
      this.queuedFollowUps.set(payload.session.id, queued);
      return userMessage;
    }

    const pendingTurn = { cancelled: false };
    this.pendingTurns.set(payload.session.id, pendingTurn);
    let userMessage: MessageRecord;
    let persistence: RuntimePersistence;
    try {
      await this.ensureAgentAvailable(payload.session.agentType);
      payload = await this.refreshSessionWorkingPath(payload);
      userMessage = this.createUserMessage(payload);
      await this.captureSessionCheckpoint(payload, userMessage);
      await this.state.saveUserMessage(userMessage);
      persistence = {
        ...(await this.createRuntimePersistence(payload.session.id)),
        providerConfig,
      };
      this.runtime.createSessionRuntime(payload, persistence);
      this.runtime.emitAgentEvent({
        type: "state.changed",
        sessionId: payload.session.id,
        status: "running",
      });
    } catch (error) {
      this.pendingTurns.delete(payload.session.id);
      throw error;
    }

    void this.trackBackgroundSend(
      this.dispatchSessionMessage(
        payload,
        userMessage,
        pendingTurn,
        persistence,
        providerConfig,
      )
        .catch(async (error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown agent runtime error";
          console.error("[CocurdexDaemonService] Background send failed", {
            agentType: payload.session.agentType,
            error: message,
            sessionId: payload.session.id,
          });
          this.runtime.emitAgentEvent({
            type: "error",
            sessionId: payload.session.id,
            message,
          });
        })
        .finally(() => {
          if (this.pendingTurns.get(payload.session.id) === pendingTurn) {
            this.pendingTurns.delete(payload.session.id);
            void this.startNextQueuedFollowUp(payload.session.id);
          }
        }),
    );

    return userMessage;
  }

  private trackBackgroundSend<T>(work: Promise<T>): Promise<T> {
    this.backgroundSends.add(work);
    return work.finally(() => this.backgroundSends.delete(work));
  }

  async resumeQueuedSession(sessionId: string) {
    validateSessionId(sessionId);
    return this.sessionCommands.run(sessionId, () =>
      this.restoreQueuedSession(sessionId),
    );
  }

  private async restoreQueuedSession(sessionId: string) {
    if (
      this.pendingTurns.has(sessionId) ||
      this.queuedFollowUps.has(sessionId)
    ) {
      return false;
    }

    const [session, inputs, messages] = await Promise.all([
      this.state.getSession(sessionId),
      this.state.listQueuedAgentInputs(sessionId),
      this.state.listMessagesBySessionId(sessionId),
    ]);
    if (!session || session.archivedAt || inputs.length === 0 || this.stopping)
      return false;

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
    if (queued.length === 0) return false;

    this.queuedFollowUps.set(sessionId, queued);
    return this.dispatchNextQueuedInput(sessionId);
  }

  async updateQueuedAgentInput(
    sessionId: string,
    messageId: string,
    content: string,
  ) {
    const trimmedContent = content.trim();
    const queued = this.queuedFollowUps.get(sessionId);
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
    const queued = this.queuedFollowUps.get(sessionId);
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
    if (!this.pendingTurns.has(sessionId)) {
      throw new Error(`Session ${sessionId} has no active turn`);
    }

    const queued = this.queuedFollowUps.get(sessionId);
    const index = queued?.findIndex(
      (item) => item.payload.messageId === messageId,
    );
    const item = index == null || index < 0 ? undefined : queued?.[index];
    if (!queued || !item || index == null || index < 0) {
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

    const agent = await this.ensureAgentAvailable(
      item.payload.session.agentType,
    );
    if (!agent.capabilities.supportsSteering) {
      throw new Error(`${agent.label} does not support steering active turns.`);
    }

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
    const persistence = await this.createRuntimePersistence(sessionId);
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

  private async startNextQueuedFollowUp(sessionId: string) {
    return this.sessionCommands.run(sessionId, () =>
      this.dispatchNextQueuedInput(sessionId),
    );
  }

  private async dispatchNextQueuedInput(sessionId: string): Promise<boolean> {
    if (this.stopping) return false;
    if (this.pendingTurns.has(sessionId)) return false;

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
      const userMessage = await this.acceptSessionMessage({
        sessionId,
        messageId: next.payload.messageId,
        createdAt: next.payload.createdAt,
        content: next.payload.content,
        attachments: next.payload.attachments,
        thinkingLevel: next.payload.thinkingLevel,
        delivery: next.payload.delivery,
      });
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
    return this.sessionCommands.run(sessionId, () =>
      this.stopSessionTurn(sessionId),
    );
  }

  private async stopSessionTurn(sessionId: string) {
    const pendingTurn = this.clearPendingTurn(sessionId);
    await this.workspaceChanges.failTurn(sessionId, "interrupted");
    const cancelled = await this.runtime.cancelSessionTurn(sessionId);
    if (pendingTurn && !cancelled) {
      this.runtime.emitAgentEvent({
        type: "state.changed",
        sessionId,
        status: "idle",
      });
    }
    return null;
  }

  private async disposeSessionRuntime(sessionId: string) {
    const pendingTurn = this.clearPendingTurn(sessionId);
    this.queuedFollowUps.delete(sessionId);
    const disposed = await this.runtime.disposeSessionRuntime(sessionId);
    if (pendingTurn && !disposed) {
      this.runtime.emitAgentEvent({
        type: "state.changed",
        sessionId,
        status: "idle",
      });
    }
  }

  private clearPendingTurn(sessionId: string) {
    const pendingTurn = this.pendingTurns.get(sessionId);
    if (pendingTurn) {
      pendingTurn.cancelled = true;
      this.pendingTurns.delete(sessionId);
    }
    return pendingTurn;
  }

  resolvePermission(requestId: string, decision: AgentPermissionDecision) {
    return this.runtime.resolveAgentPermission(requestId, decision);
  }

  private async ensureAgentAvailable(agentId: AgentId) {
    const agents = await this.listAgents();
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
    sessionId: string,
  ): Promise<RuntimePersistence> {
    const providerSession = await this.state.getProviderSession(sessionId);

    return {
      providerSession,
      onProviderSessionUpdate: (nextProviderSession) => {
        if (!nextProviderSession) {
          void this.state.clearProviderSession(sessionId);
          return;
        }

        void this.state.saveProviderSession(
          nextProviderSession.sessionId,
          nextProviderSession.providerSessionId,
          JSON.parse(nextProviderSession.providerStateJson) as Record<
            string,
            unknown
          >,
          nextProviderSession.resumable,
          nextProviderSession.providerVersion,
        );
      },
    };
  }

  private async performShutdown() {
    this.stopping = true;
    await this.startupRecovery;
    clearInterval(this.checkpointReconcileTimer);
    for (const pendingTurn of this.pendingTurns.values()) {
      pendingTurn.cancelled = true;
    }
    this.pendingTurns.clear();
    this.queuedFollowUps.clear();
    const schedulerClose = this.workflowWorkerScheduler.close();
    try {
      const results = await Promise.allSettled([
        this.chatService.shutdown(),
        this.runtime.shutdown(),
        schedulerClose,
        Promise.resolve().then(() => this.searchService.dispose()),
      ]);
      await Promise.allSettled([...this.backgroundSends]);
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
      console.error("[CocurdexDaemonService] Workflow worker failed", error);
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
      id: payload.messageId ?? crypto.randomUUID(),
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
    pendingTurn: { cancelled: boolean },
    persistence: RuntimePersistence,
    providerConfig: AgentRuntimeProviderConfig | null,
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
    if (pendingTurn.cancelled) {
      return;
    }

    await this.workspaceChanges.beginTurn({
      sessionId: payload.session.id,
      userMessageId: userMessage.id,
      workspaceRootPath: payload.workspaceRootPath,
    });

    if (pendingTurn.cancelled) {
      await this.workspaceChanges.failTurn(payload.session.id, "interrupted");
      return;
    }

    await this.runtime.sendSessionMessage(
      {
        ...payload,
        content: userMessage.content,
        attachments: userMessage.attachments,
      },
      {
        ...persistence,
        history,
        providerConfig,
      },
    );
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
      const persistence = await this.createRuntimePersistence(
        payload.session.id,
      );
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
    if (!this.pendingTurns.has(payload.session.id)) {
      void this.startNextQueuedFollowUp(payload.session.id);
    }
  }
}

export function onAgentEvent(
  service: CocurdexDaemonService,
  listener: (event: AgentEvent) => void,
) {
  const daemonListener = (event: CocurdexDaemonEvent) => {
    if (
      event.type !== "data.changed" &&
      event.type !== "peer.message" &&
      event.type !== "team.changed" &&
      !isWorkspaceSearchDaemonEvent(event) &&
      !("conversationId" in event)
    ) {
      listener(event);
    }
  };
  service.events.on("daemon.event", daemonListener);
  return () => {
    service.events.off("daemon.event", daemonListener);
  };
}
