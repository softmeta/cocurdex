import type { AgentId } from "./agent-identity";
import type {
  AgentPermissionRequestedEvent,
  AgentPermissionResolvedEvent,
  AgentPlanApprovalRequestedEvent,
  AgentPlanApprovalResolvedEvent,
  AgentPlanUpdatedEvent,
  AgentQuestionRequestedEvent,
  AgentQuestionResolvedEvent,
} from "./agent-interactions";
import type { AgentToolCallRecord } from "./agent-tool-call-contracts";
import type {
  AgentContextBreakdownUpdatedEvent,
  AgentRateLimitsUpdatedEvent,
  AgentUsageRecord,
  AgentUsageUpdatedEvent,
} from "./agent-usage";
import type { MessageAttachment } from "./message-attachments";
import type {
  AgentNativeWorkspaceEvidenceEvent,
  AgentTurnChangesUpdatedEvent,
  TurnChangeSet,
} from "./workspace-changes";

export * from "./agent-identity";
export * from "./agent-interactions";
export * from "./agent-tool-call-contracts";
export * from "./agent-usage";
export * from "./message-attachments";

export type SessionStatus = "idle" | "running" | "error" | "exited";
export type WriteMode = "read-only" | "native-write";

export const PLAN_MODE_ID = "plan";

export function isPlanModeId(modeId: string | null | undefined) {
  return modeId === PLAN_MODE_ID;
}

export type AgentAvailability =
  | "available"
  | "missing"
  | "unsupported"
  | "error";
export type AgentPermissionMode =
  | "claude-default"
  | "claude-accept-edits"
  | "claude-auto"
  | "claude-plan"
  | "claude-bypass-permissions"
  | "codex-read-only"
  | "codex-auto"
  | "codex-full-access"
  | "grok-ask"
  | "grok-auto"
  | "grok-always-approve"
  | "opencode-ask"
  | "opencode-allow"
  | "opencode-deny";
export type AgentPermissionModeRisk = "normal" | "elevated" | "dangerous";

export interface AgentPermissionModeOption {
  id: AgentPermissionMode;
  risk: AgentPermissionModeRisk;
}
export const providerApis = [
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
] as const;

export type ProviderApi = (typeof providerApis)[number];

export type ProviderModelSource = "api" | "manual";
export type ProviderModelCapability = "agent" | "chat" | "vision" | "reasoning";
export type CodexReasoningEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";
export type ReasoningEffort = CodexReasoningEffort;
export type ClaudeReasoningEffort = Exclude<
  ReasoningEffort,
  "minimal" | "ultra"
>;
export type AgentThinkingLevel = "default" | "off" | ReasoningEffort;
export type PiThinkingLevel = Exclude<
  AgentThinkingLevel,
  "default" | "max" | "ultra"
>;
export const piThinkingLevels = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly PiThinkingLevel[];

export const reasoningEfforts = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const satisfies readonly ReasoningEffort[];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (reasoningEfforts as readonly string[]).includes(value);
}

export interface ReasoningEffortOption {
  reasoningEffort: Exclude<AgentThinkingLevel, "default">;
  description: string;
  label?: string | null;
}

export interface CodexServiceTierOption {
  id: string;
  name: string;
  description: string;
}

export interface AgentProviderModelAxes {
  defaultReasoningEffort: Exclude<AgentThinkingLevel, "default"> | null;
  supportedReasoningEfforts: ReasoningEffortOption[];
  serviceTiers: CodexServiceTierOption[];
}

export type AgentRuntimeAxis =
  | "model"
  | "thinking"
  | "permission"
  | "speed"
  | "agent"
  | "variant";
export type AgentRuntimeChangePolicy = "in-session";
export type AgentRuntimeAxisCapabilities = Partial<
  Record<AgentRuntimeAxis, AgentRuntimeChangePolicy>
>;

export interface AgentProviderSnapshot {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  api: ProviderApi;
  baseUrl: string;
  modelBaseUrl?: string | null;
  headersJson?: string | null;
  providerCompatJson?: string | null;
  modelCompatJson?: string | null;
  modelCapabilities?: ProviderModelCapability[];
  modelCostJson?: string | null;
  modelThinkingLevelMapJson?: string | null;
  modelContextWindow?: number | null;
  modelMaxTokens?: number | null;
  reasoningEffort?: ReasoningEffort | null;
  thinkingLevel?: AgentThinkingLevel | null;
  supportedReasoningEfforts?: ReasoningEffortOption[];
  modelDefaultReasoningEffort?: Exclude<AgentThinkingLevel, "default"> | null;
  supportsReasoning?: boolean;
  serviceTier?: string | null;
  fastMode?: boolean | null;
  openCodeAgent?: string | null;
  openCodeVariant?: string | null;
}

export interface AgentRuntimeProviderConfig extends AgentProviderSnapshot {
  apiKey: string | null;
}

export type SessionTitleStrategy =
  | "native"
  | "adapter-generated"
  | "app-generated";

export interface AgentCapabilities {
  sessionModes: AgentSessionMode[];
  permissionModes: AgentPermissionModeOption[];
  writeModes: WriteMode[];
  supportsSteering: boolean;
  supportsStreaming: boolean;
  supportsSelections: boolean;
  sessionTitleStrategy: SessionTitleStrategy;
  transport: "native" | "acp";
  runtimeAxes?: AgentRuntimeAxisCapabilities;
}

export interface AgentInstallation {
  executableName: string | null;
  executablePath: string | null;
  error?: string | null;
  version?: string | null;
}

export interface AgentDescriptor {
  id: AgentId;
  label: string;
  availability: AgentAvailability;
  capabilities: AgentCapabilities;
  installation?: AgentInstallation | null;
  enabled?: boolean;
}

export interface AgentSlashCommand {
  name: string;
  description?: string;
  invocation?: string;
  source: "agent" | "extension" | "prompt" | "skill";
}

export interface HostDirectoryEntry {
  name: string;
  path: string;
  hidden: boolean;
}

export interface HostDirectoryListing {
  path: string;
  parent: string | null;
  entries: HostDirectoryEntry[];
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  rootPaths: string[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  sortOrder: number;
  missingRootPaths?: string[];
}

export type SessionKind =
  | "main"
  | "subagent"
  | "teammate"
  | "chat"
  | "personal";

export interface SessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  agentType: AgentId;
  sessionKind?: SessionKind;
  parentSessionId?: string | null;
  parentToolCallId?: string | null;
  status: SessionStatus;
  writeMode: WriteMode;
  sessionModeId: string | null;
  permissionMode?: AgentPermissionMode;
  agentRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  archivedAt?: string | null;
  pinnedAt?: string | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  worktreePath?: string | null;
  peerInbound?: "deliver" | "refuse";
  importedProviderSessionId?: string | null;
  importedAt?: string | null;
}

export interface PeerMessageOrigin {
  kind: "peer";
  sessionId: string;
  sessionTitle: string;
}

export type DelegationReportOutcome =
  | "finished"
  | "ready"
  | "needs_you"
  | "blocked"
  | "failed"
  | "cancelled"
  | "interrupted";

export const DELEGATION_REPORT_OUTCOMES = [
  "finished",
  "ready",
  "needs_you",
  "blocked",
  "failed",
  "cancelled",
  "interrupted",
] as const satisfies readonly DelegationReportOutcome[];

export interface DelegationMessageOrigin {
  kind: "delegation";
  sessionId: string;
  sessionTitle: string;
  outcome: DelegationReportOutcome;
  hostId?: string;
  hostName?: string;
}

export interface RemoteHostMessageOrigin {
  kind: "remoteHost";
  hostName: string;
  senderName: string;
  hostId?: string;
  sessionId?: string;
}

export interface ScriptRunMessageOrigin {
  kind: "scriptRun";
  runId: string;
  runName: string;
}

export interface RoutineMessageOrigin {
  kind: "routine";
  routineId: string;
  routineName: string;
  runId?: string;
  sessionId?: string;
}

export interface BriefMessageOrigin {
  kind: "brief";
  day: string;
}

export interface GreetingMessageOrigin {
  kind: "greeting";
}

export type MessageOrigin =
  | PeerMessageOrigin
  | DelegationMessageOrigin
  | RemoteHostMessageOrigin
  | ScriptRunMessageOrigin
  | RoutineMessageOrigin
  | BriefMessageOrigin
  | GreetingMessageOrigin;

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  kind?: "reasoning" | "response";
  content: string;
  attachments: MessageAttachment[];
  createdAt: string;
  seq?: number;
  origin?: MessageOrigin | null;
  runId?: string | null;
}

export type RunStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

export interface RunRecord {
  id: string;
  sessionId: string;
  triggerMessageId: string;
  status: RunStatus;
  error?: string | null;
  startedAt: string;
  endedAt?: string | null;
  agentType?: AgentId | null;
}

export interface AgentMessageDeltaEvent {
  type: "message.delta";
  sessionId: string;
  messageId: string;
  role: "assistant";
  kind?: "reasoning" | "response";
  delta: string;
  createdAt: string;
  seq?: number;
}

export interface AgentMessageCompletedEvent {
  type: "message.completed";
  sessionId: string;
  message: MessageRecord;
}

export interface AgentSessionUpsertedEvent {
  type: "session.upserted";
  sessionId: string;
  session: SessionRecord;
}

export interface AgentSessionTitleUpdatedEvent {
  type: "session.title.updated";
  sessionId: string;
  title: string;
  expectedTitle: string;
  updatedAt: string;
}

export interface AgentToolStartedEvent {
  type: "tool.started";
  sessionId: string;
  toolCall: AgentToolCallRecord;
}

export interface AgentToolFinishedEvent {
  type: "tool.finished";
  sessionId: string;
  toolCall: AgentToolCallRecord;
}

export interface AgentToolUpdatedEvent {
  type: "tool.updated";
  sessionId: string;
  toolCall: AgentToolCallRecord;
}

export interface AgentNegotiatedCapabilities {
  protocol: {
    kind: "acp" | "native";
    version?: number;
  };
  loadSession: boolean;
  resumeSession: boolean;
  prompt: {
    audio: boolean;
    embeddedContext: boolean;
    image: boolean;
  };
}

export interface AgentCapabilitiesUpdatedEvent {
  type: "capabilities.updated";
  sessionId: string;
  capabilities: AgentNegotiatedCapabilities;
}

export interface AgentCommandsUpdatedEvent {
  type: "commands.updated";
  sessionId: string;
  commands: AgentSlashCommand[];
}

export interface AgentMcpServerRuntime {
  name: string;
  status: string;
}

export interface AgentProviderRuntimeSnapshot {
  providerId: AgentId;
  apiKeySource?: string | null;
  capabilities: string[];
  cwd: string;
  fastModeDisabledReason?: string | null;
  fastModeState?: string | null;
  mcpServers: AgentMcpServerRuntime[];
  model: string;
  runtimeVersion: string;
  skills: string[];
  tools: string[];
}

export interface AgentProviderRuntimeUpdatedEvent {
  type: "provider.runtime.updated";
  sessionId: string;
  runtime: AgentProviderRuntimeSnapshot;
  receivedAt: string;
}

export interface AgentSessionConfigSelectOption {
  value: string;
  name: string;
  description?: string | null;
}

export interface AgentSessionConfigOption {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  type: "boolean" | "select";
  currentValue: boolean | string;
  options?: AgentSessionConfigSelectOption[];
}

export interface AgentSessionConfigUpdatedEvent {
  type: "session.config.updated";
  sessionId: string;
  configOptions: AgentSessionConfigOption[];
}

export interface AgentSessionRuntimeReleasedEvent {
  type: "session.runtime.released";
  sessionId: string;
}

export interface AgentSessionMode {
  id: string;
  name: string;
  description?: string | null;
}

export interface AgentSessionModeUpdatedEvent {
  type: "session.mode.updated";
  sessionId: string;
  currentModeId: string;
  availableModes?: AgentSessionMode[];
}

export interface AgentStateChangedEvent {
  type: "state.changed";
  sessionId: string;
  status: SessionStatus;
}

export interface AgentRunUpdatedEvent {
  type: "run.updated";
  sessionId: string;
  run: RunRecord;
}

export interface AgentErrorEvent {
  type: "error";
  sessionId: string;
  message: string;
  systemMessage?: MessageRecord;
}

export interface AgentTurnCompletedEvent {
  type: "turn.completed";
  sessionId: string;
  messageId: string;
  durationMs: number;
  usage?: AgentUsageRecord;
  stopReason?:
    | "cancelled"
    | "end_turn"
    | "max_tokens"
    | "max_turn_requests"
    | "refusal"
    | "unknown";
  completedAt: string;
}

export interface SessionMessagesResult {
  messages: MessageRecord[];
  turnStats: Record<string, AgentTurnCompletedEvent>;
  turnChangeSets: Record<string, TurnChangeSet>;
}

export type AgentEvent =
  | AgentSessionUpsertedEvent
  | AgentSessionTitleUpdatedEvent
  | AgentMessageDeltaEvent
  | AgentMessageCompletedEvent
  | AgentToolStartedEvent
  | AgentToolUpdatedEvent
  | AgentToolFinishedEvent
  | AgentCapabilitiesUpdatedEvent
  | AgentCommandsUpdatedEvent
  | AgentProviderRuntimeUpdatedEvent
  | AgentSessionConfigUpdatedEvent
  | AgentSessionModeUpdatedEvent
  | AgentSessionRuntimeReleasedEvent
  | AgentStateChangedEvent
  | AgentPermissionRequestedEvent
  | AgentPermissionResolvedEvent
  | AgentQuestionRequestedEvent
  | AgentQuestionResolvedEvent
  | AgentPlanApprovalRequestedEvent
  | AgentPlanApprovalResolvedEvent
  | AgentPlanUpdatedEvent
  | AgentUsageUpdatedEvent
  | AgentRateLimitsUpdatedEvent
  | AgentContextBreakdownUpdatedEvent
  | AgentTurnCompletedEvent
  | AgentNativeWorkspaceEvidenceEvent
  | AgentTurnChangesUpdatedEvent
  | AgentRunUpdatedEvent
  | AgentErrorEvent;

export type AgentInputDelivery =
  | "start-new-run"
  | "steer-active-run"
  | "queue-after-run";

export interface QueuedAgentInputRecord {
  messageId: string;
  sessionId: string;
  workspaceRootPath: string;
  thinkingLevel?: AgentThinkingLevel;
  createdAt: string;
}

export interface UpdateQueuedAgentInputPayload {
  sessionId: string;
  messageId: string;
  content: string;
}

export interface QueuedAgentInputActionPayload {
  sessionId: string;
  messageId: string;
}

export interface UpdateSessionTitlePayload {
  sessionId: string;
  title: string;
  expectedTitle?: string | null;
  updatedAt?: string;
}

export interface SetSessionPinnedPayload {
  sessionId: string;
  pinned: boolean;
}

export interface SessionIdsPayload {
  sessionIds: string[];
}

export interface ArchiveSessionsResult {
  archivedSessionIds: string[];
  skippedCount: number;
}

export interface ArchiveSessionPayload {
  sessionId: string;
  archivedAt?: string;
}

export interface DeleteSessionPayload {
  sessionId: string;
}

export interface SessionRuntimeSelection {
  reasoningEffort?: ReasoningEffort | null;
  serviceTier?: string | null;
  fastMode?: boolean | null;
  thinkingLevel?: AgentThinkingLevel | null;
  openCodeAgent?: string | null;
  openCodeVariant?: string | null;
}

export interface CreateSessionPayload {
  workspaceId: string;
  agentType?: AgentId;
  model?: { providerId: string; modelId: string } | null;
  permissionMode?: AgentPermissionMode | null;
  agentRoleId?: string | null;
  title?: string;
  runtime?: SessionRuntimeSelection;
}

export interface UpdateSessionRuntimePayload {
  sessionId: string;
  model?: { providerId: string; modelId: string };
  runtime?: SessionRuntimeSelection;
}

export interface NewSessionDefaults {
  agentType: AgentId;
  model: { providerId: string; modelId: string; name: string } | null;
  permissionMode: AgentPermissionMode | null;
  permissionModes: AgentPermissionMode[];
}

export interface RefineSessionTitlePayload {
  sessionId: string;
  message: string;
  fallbackTitle: string;
  expectedTitle: string;
}

export interface BrowserAnnotation {
  id: string;
  type: "element" | "region";
  selector?: string;
  tagName?: string;
  textContent?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  regionScreenshot?: string;
  pageUrl: string;
  note?: string;
  styleChanges?: BrowserAnnotationStyleChange[];
  capturedAt: string;
}

export interface BrowserAnnotationStyleChange {
  property: string;
  from: string;
  to: string;
}

export interface EditorViewRecord {
  sessionId: string;
  openFiles: string[];
  activeFile: string | null;
  selections: Array<{ filePath: string; startLine: number; endLine: number }>;
}

export interface AppBootstrapData {
  workspaces: WorkspaceRecord[];
  sessions: SessionRecord[];
  queuedMessages: MessageRecord[];
  queuedAgentInputs: QueuedAgentInputRecord[];
  activeRuns: RunRecord[];
  sessionUsage: Record<string, AgentUsageRecord>;
  editorViews: EditorViewRecord[];
  syncCursor: string;
  pausedQueueSessionIds: string[];
}

export type StoredBootstrapData = Omit<
  AppBootstrapData,
  "pausedQueueSessionIds"
>;
