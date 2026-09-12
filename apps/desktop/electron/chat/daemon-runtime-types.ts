import type {
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentRuntimeProviderConfig,
  AgentSessionConfigOption,
  AgentSlashCommand,
  CocurdexDaemonEvent,
  CreateSessionPayload,
  MessageRecord,
  SendSessionMessagePayload,
  TurnChangeDiff,
  TurnChangeDiffRequest,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  TurnChangeSet,
  UndoTurnChangesInput,
  UndoTurnChangesResult,
} from "@cocurdex/shared";

export interface DaemonRuntimeLogger {
  debug(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
}

export interface DaemonRuntimeClientOptions {
  daemonEntryPath: string;
  logger: DaemonRuntimeLogger;
  onEvent(event: CocurdexDaemonEvent): void;
  onConnected?(): void;
  userDataPath: string;
}

export interface DaemonRuntimeStatus {
  running: boolean;
  pid: number | null;
  protocolVersion: number | null;
  runtimeFingerprint: string | null;
  expectedRuntimeFingerprint: string | null;
  socketPath: string | null;
  startedAt: string | null;
  matchesRuntime: boolean;
  ownedByThisApp: boolean;
  error: string | null;
}

export interface DaemonRuntimeClient {
  createSession(
    payload: CreateSessionPayload,
  ): Promise<CreateSessionPayload["session"]>;
  deleteSession(sessionId: string): Promise<void>;
  dispose(): Promise<void>;
  getStatus(): Promise<DaemonRuntimeStatus>;
  initialize(): Promise<void>;
  listSlashCommands(
    agentType: AgentId,
    workspaceRootPath: string,
  ): Promise<AgentSlashCommand[]>;
  restart(): Promise<DaemonRuntimeStatus>;
  resolvePermission(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<boolean>;
  resolveQuestion(questionId: string, answer: string): Promise<boolean>;
  resolvePlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<boolean>;
  rewindSession(message: MessageRecord): Promise<void>;
  resumeQueuedSession(
    sessionId: string,
    providerConfig: AgentRuntimeProviderConfig | null,
  ): Promise<boolean>;
  sendMessage(
    payload: SendSessionMessagePayload,
    providerConfig: AgentRuntimeProviderConfig | null,
  ): Promise<MessageRecord>;
  updateQueuedInput(
    sessionId: string,
    messageId: string,
    content: string,
  ): Promise<MessageRecord>;
  deleteQueuedInput(sessionId: string, messageId: string): Promise<void>;
  steerQueuedInput(
    sessionId: string,
    messageId: string,
  ): Promise<MessageRecord>;
  setConfig(
    sessionId: string,
    configId: string,
    value: boolean | string,
  ): Promise<AgentSessionConfigOption[]>;
  setMode(sessionId: string, modeId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  undoTurnChanges(
    payload: UndoTurnChangesInput,
  ): Promise<UndoTurnChangesResult>;
  getTurnChangeFile(
    payload: TurnChangeFileContentRequest,
  ): Promise<TurnChangeFileContent>;
  listTurnChangeSets(sessionId: string): Promise<TurnChangeSet[]>;
  getTurnChangeDiff(payload: TurnChangeDiffRequest): Promise<TurnChangeDiff>;
}
