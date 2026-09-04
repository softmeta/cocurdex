import type {
  AgentNativeWorkspaceEvidenceEvent,
  AgentTurnChangesUpdatedEvent,
  TurnChangeSet,
} from "./workspace-changes";

export type AgentId =
  | "claude-agent"
  | "codex"
  | "grok-build"
  | "pi"
  | "opencode";

export const PLAN_USAGE_AGENT_IDS = [
  "claude-agent",
  "codex",
  "grok-build",
] as const satisfies readonly AgentId[];

export type PlanUsageAgentId = (typeof PLAN_USAGE_AGENT_IDS)[number];

export function isPlanUsageAgentId(id: AgentId): id is PlanUsageAgentId {
  return (PLAN_USAGE_AGENT_IDS as readonly AgentId[]).includes(id);
}

export type SessionStatus = "idle" | "running" | "error" | "exited";
export type WriteMode = "read-only" | "native-write";
export type CollaborationModeKind = "default" | "plan";
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
  // Grok Build's three permission states, switched over ACP with the
  // `x.ai/yolo_mode_changed` ext notification. "auto" defers to Grok's own
  // risk classifier, which costs an extra model call per tool use.
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
// Codex reports its own ladder up to max / ultra; adapters keep their vendor
// vocabulary instead of being normalized down to a shared subset.
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
  reasoningEffort: ReasoningEffort;
  description: string;
  /** The agent's own name for this level, when it publishes one. */
  label?: string | null;
}

export interface CodexServiceTierOption {
  id: string;
  name: string;
  description: string;
}

// Runtime controls are exposed only when the adapter can apply them without
// recreating the provider session. Missing axes are intentionally unsupported;
// there is no restart-based fallback because it can break native cache and
// conversation continuity.
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

// Codex account state as reported by `codex app-server` (account/read).
// Tokens live in ~/.codex and are managed entirely by Codex itself.
export interface CodexAccountState {
  method: "apikey" | "chatgpt" | "other" | null;
  email: string | null;
  planType: string | null;
  requiresOpenaiAuth: boolean;
}

export interface CodexLoginStartResult {
  loginId: string;
  authUrl: string;
}

export interface CodexLoginOutcome {
  success: boolean;
  error: string | null;
}

export interface AgentProviderSnapshot {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  api: ProviderApi;
  baseUrl: string;
  // Per-model endpoint override; falls back to baseUrl when absent. See
  // ProviderModelRecord.baseUrl.
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
  // Explicit per-session thinking choice for adapters whose reasoning axis is
  // sent with each prompt. Null means the adapter/model default remains active.
  thinkingLevel?: AgentThinkingLevel | null;
  // Thinking levels the selected model accepts, as reported by the agent's own
  // catalog (e.g. Grok Build's reasoning efforts). Drives the composer picker
  // for agents that don't ship a pi-style thinkingLevelMap.
  supportedReasoningEfforts?: ReasoningEffortOption[];
  // Effort the model runs at when the session sets none. Null when the agent
  // publishes no default, in which case the picker shows no selection.
  modelDefaultReasoningEffort?: ReasoningEffort | null;
  supportsReasoning?: boolean;
  serviceTier?: string | null;
  fastMode?: boolean | null;
  // OpenCode-specific runtime axes. Null keeps the native OpenCode default.
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
  collaborationModes: CollaborationModeKind[];
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
}

/** A command offered by the composer's slash-triggered skill picker. */
export interface AgentSlashCommand {
  /** Stable skill name without an invocation prefix. */
  name: string;
  description?: string;
  /** Adapter-native text inserted when the user selects the skill. */
  invocation?: string;
  source: "agent" | "extension" | "prompt" | "skill";
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  sortOrder: number;
}

export interface SessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  agentType: AgentId;
  sessionKind?: "main" | "subagent";
  parentSessionId?: string | null;
  parentToolCallId?: string | null;
  status: SessionStatus;
  writeMode: WriteMode;
  collaborationMode: CollaborationModeKind;
  permissionMode?: AgentPermissionMode;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  archivedAt?: string | null;
  providerSnapshot?: AgentProviderSnapshot | null;
}

export interface ProviderConfigRecord {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  apiKeySecretId: string | null;
  headersJson?: string | null;
  compatJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderTemplateRecord {
  id: string;
  name: string;
  baseUrl: string;
  authMethods?: ProviderAuthMethodRecord[];
}

export type ProviderAuthMethod = "oauth" | "api_key";

export interface ProviderAuthMethodRecord {
  type: ProviderAuthMethod;
  name: string;
  label: string;
  isSubscription: boolean;
}

export interface ProviderAuthState {
  providerId: string;
  type: ProviderAuthMethod | null;
  source: string | null;
}

export type ProviderAuthPrompt =
  | {
      id: string;
      type: "text" | "secret" | "manual_code";
      message: string;
      placeholder: string | null;
    }
  | {
      id: string;
      type: "select";
      message: string;
      options: Array<{
        id: string;
        label: string;
        description: string | null;
      }>;
    };

export type ProviderAuthLoginUpdate =
  | { type: "info" | "progress"; message: string }
  | { type: "auth_url"; url: string; instructions: string | null }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
    }
  | { type: "prompt"; prompt: ProviderAuthPrompt }
  | { type: "prompt_cancelled"; promptId: string }
  | { type: "complete" }
  | { type: "error"; error: string };

export interface ProviderModelRecord {
  providerId: string;
  modelId: string;
  name: string;
  api: ProviderApi;
  enabled: boolean;
  source: ProviderModelSource;
  // Per-model endpoint. Pi gateways (e.g. opencode-go) serve different apis at
  // different paths, so anthropic-messages and openai-completions models under
  // one provider carry distinct baseUrls. Null falls back to provider.baseUrl.
  baseUrl?: string | null;
  contextLimit?: number | null;
  outputLimit?: number | null;
  capabilities?: ProviderModelCapability[];
  reasoning?: boolean;
  thinkingLevelMapJson?: string | null;
  costJson?: string | null;
  compatJson?: string | null;
  defaultReasoningEffort?: ReasoningEffort | null;
  supportedReasoningEfforts?: ReasoningEffortOption[];
  serviceTiers?: CodexServiceTierOption[];
  supportsFastMode?: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProviderSelection {
  agentId: AgentId;
  providerId: string;
  modelId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompatibleProviderModel {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
}

// Dedicated model for one-shot built-in Pi title generation. Other
// agent adapters own their session-title strategy (Claude uses Haiku via
// the CLI; Codex uses `codex exec`).
export interface TitleModelSelection {
  providerId: string;
  modelId: string;
}

// Result of a one-shot connectivity probe against the dedicated title model.
export interface TitleModelProbeResult {
  ok: boolean;
  /** Wall-clock time from request start to success/failure. */
  latencyMs: number;
  /** Sample title produced by the probe, when the model returned usable text. */
  title?: string | null;
  error?: string | null;
}

// Dedicated agent + model for one-shot git commit message generation. The
// selected agent resolves its own model catalog and runs in a temporary,
// non-persisted session. When unset, blank commit messages fail until the user
// types one or configures a model.
export interface CommitMessageModelSelection {
  agentId: AgentId;
  providerId: string;
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
  thinkingLevel?: AgentThinkingLevel | null;
  serviceTier?: string | null;
  fastMode?: boolean | null;
  openCodeAgent?: string | null;
  openCodeVariant?: string | null;
}

export interface ProviderListModelsResult {
  models: ProviderModelRecord[];
  error?: string | null;
}

export interface AgentProviderSessionRecord {
  sessionId: string;
  providerSessionId: string | null;
  providerStateJson: string;
  providerVersion: string | null;
  resumable: boolean;
  updatedAt: string;
}

export interface ContextFileAttachment {
  kind?: "context-file";
  filePath: string;
  language: string;
  selectedText: string;
  startLine: number;
  startColumn?: number;
  endLine: number;
  endColumn?: number;
  surroundingContext: string;
  // Whole-file @mentions omit bytes so the agent Reads the path. Selections
  // keep selectedText / surroundingContext inlined.
  contentOmitted?: boolean;
}

export interface ContextFolderAttachment {
  kind: "context-folder";
  folderPath: string;
}

export interface ImageAttachment {
  kind: "image";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  filePath: string;
  width: number;
  height: number;
}

export interface DocumentAttachment {
  kind: "document";
  id: string;
  name: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  filePath: string;
}

export type MessageAttachment =
  | ContextFileAttachment
  | ContextFolderAttachment
  | ImageAttachment
  | DocumentAttachment;

export function isImageAttachment(
  attachment: MessageAttachment,
): attachment is ImageAttachment {
  return attachment.kind === "image";
}

export function isDocumentAttachment(
  attachment: MessageAttachment,
): attachment is DocumentAttachment {
  return attachment.kind === "document";
}

export function isContextFileAttachment(
  attachment: MessageAttachment,
): attachment is ContextFileAttachment {
  return attachment.kind === undefined || attachment.kind === "context-file";
}

export function isContextFolderAttachment(
  attachment: MessageAttachment,
): attachment is ContextFolderAttachment {
  return attachment.kind === "context-folder";
}

export function isContextAttachment(
  attachment: MessageAttachment,
): attachment is ContextFileAttachment | ContextFolderAttachment {
  return (
    isContextFileAttachment(attachment) || isContextFolderAttachment(attachment)
  );
}

// Line/column range label for a code selection. Columns are only present when
// the selection is a partial range (a whole-line selection drops them at
// capture time), so `L19-19` reads as "whole line(s)" and `L19:5-19:20` as a
// partial span.
export function formatContextFileRange(
  attachment: Pick<
    ContextFileAttachment,
    "startLine" | "startColumn" | "endLine" | "endColumn"
  >,
): string {
  const { startLine, startColumn, endLine, endColumn } = attachment;
  if (startColumn !== undefined && endColumn !== undefined) {
    return `L${startLine}:${startColumn}-${endLine}:${endColumn}`;
  }
  return `L${startLine}-${endLine}`;
}

export function formatContextFileChipLabel(
  attachment: Pick<
    ContextFileAttachment,
    | "contentOmitted"
    | "filePath"
    | "startLine"
    | "startColumn"
    | "endLine"
    | "endColumn"
  >,
): string {
  const fileName = attachment.filePath.split("/").pop() ?? attachment.filePath;
  if (attachment.contentOmitted) {
    return fileName;
  }
  return `${fileName} ${formatContextFileRange(attachment)}`;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  kind?: "reasoning" | "response";
  content: string;
  attachments: MessageAttachment[];
  createdAt: string;
}

export interface AgentToolCallLocation {
  path: string;
  line?: number | null;
}

export type AgentToolCallContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "diff";
      path: string;
      oldText?: string | null;
      newText: string;
    }
  | {
      type: "terminal";
      terminalId: string;
    }
  | {
      type: "data";
      value: unknown;
    };

export interface AgentToolCallResult {
  content: AgentToolCallContent[];
  rawOutput: unknown;
}

export interface AgentSubagentReference {
  sessionId: string;
  type: string | null;
  description: string;
}

export interface AgentToolCallRecord {
  id: string;
  sessionId: string;
  title: string;
  kind?: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  subagent?: AgentSubagentReference | null;
  // Undefined is reserved for summary records whose result is loaded lazily.
  content: AgentToolCallContent[] | undefined;
  rawInput?: unknown;
  rawOutput?: unknown;
  locations: AgentToolCallLocation[];
  startedAt: string;
  updatedAt: string;
}

export type AgentPermissionDecision =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always"
  | "cancelled";
export type AgentPermissionOptionKind = Exclude<
  AgentPermissionDecision,
  "cancelled"
>;
export interface AgentPermissionOption {
  id: string;
  kind: AgentPermissionOptionKind;
  label: string;
}
export type AgentPermissionStatus = "pending" | "allowed" | "denied";

export interface AgentPermissionRequestRecord {
  id: string;
  sessionId: string;
  providerId: AgentId;
  kind: string;
  title: string;
  description?: string | null;
  rawInput?: unknown;
  locations: AgentToolCallLocation[];
  options: AgentPermissionOption[];
  status: AgentPermissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPermissionRequestPayload {
  id?: string;
  sessionId: string;
  providerId: AgentId;
  kind: string;
  title: string;
  description?: string | null;
  rawInput?: unknown;
  locations?: AgentToolCallLocation[];
  options: AgentPermissionOption[];
}

export interface AgentMessageDeltaEvent {
  type: "message.delta";
  sessionId: string;
  messageId: string;
  role: "assistant";
  kind?: "reasoning" | "response";
  delta: string;
  createdAt: string;
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

export interface AgentErrorEvent {
  type: "error";
  sessionId: string;
  message: string;
}

export interface AgentPermissionRequestedEvent {
  type: "permission.requested";
  sessionId: string;
  request: AgentPermissionRequestRecord;
}

export interface AgentPermissionResolvedEvent {
  type: "permission.resolved";
  sessionId: string;
  request: AgentPermissionRequestRecord;
  decision: AgentPermissionDecision;
}

export type AgentQuestionStatus = "pending" | "answered";

export interface AgentQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface AgentQuestionPrompt {
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
}

export interface AgentQuestionRequestRecord {
  id: string;
  sessionId: string;
  providerId: AgentId;
  question: string;
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
  status: AgentQuestionStatus;
  answer?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentQuestionRequestPayload {
  id?: string;
  sessionId: string;
  providerId: AgentId;
  question: string;
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
}

export interface AgentQuestionRequestedEvent {
  type: "question.requested";
  sessionId: string;
  question: AgentQuestionRequestRecord;
}

export interface AgentQuestionResolvedEvent {
  type: "question.resolved";
  sessionId: string;
  question: AgentQuestionRequestRecord;
}

// Grok Build parks its `exit_plan_mode` tool call on an ACP reverse-request
// (`x.ai/exit_plan_mode`) and waits for the client to approve the written plan.
// The outcome strings are the agent's wire values: anything the agent does not
// recognize is treated as "cancelled" on its side, so never invent new ones.
//
// - approved:  agent leaves plan mode and implements in the same turn
// - cancelled: agent stays in plan mode and revises, optionally using `feedback`
// - abandoned: agent leaves plan mode and stops, waiting for the user
export type AgentPlanApprovalOutcome = "approved" | "cancelled" | "abandoned";
export type AgentPlanApprovalStatus = "pending" | "resolved" | "stale";
// "inline" plans travel with the tool call; "file-backed" plans are read from
// the agent's own `plan.md`. Only the feedback reference format differs.
export type AgentPlanApprovalSource = "inline" | "file-backed";

export interface AgentPlanApprovalRecord {
  id: string;
  sessionId: string;
  providerId: AgentId;
  planContent: string | null;
  source: AgentPlanApprovalSource;
  status: AgentPlanApprovalStatus;
  outcome?: AgentPlanApprovalOutcome | null;
  feedback?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPlanApprovalRequestPayload {
  id?: string;
  sessionId: string;
  providerId: AgentId;
  planContent: string | null;
  source: AgentPlanApprovalSource;
}

export interface AgentPlanApprovalDecision {
  outcome: AgentPlanApprovalOutcome;
  feedback?: string | null;
}

export interface AgentPlanApprovalRequestedEvent {
  type: "plan.approval.requested";
  sessionId: string;
  approval: AgentPlanApprovalRecord;
}

export interface AgentPlanApprovalResolvedEvent {
  type: "plan.approval.resolved";
  sessionId: string;
  approval: AgentPlanApprovalRecord;
}

export interface AgentPlanStep {
  step: string;
  status: "pending" | "in_progress" | "completed";
}

export interface AgentPlanUpdatedEvent {
  type: "plan.updated";
  sessionId: string;
  plan: {
    explanation?: string | null;
    steps: AgentPlanStep[];
    updatedAt: string;
  };
}

// Snapshot of token usage for one agent run / turn. Field names mirror the
// Anthropic API + Claude Code SDK so adapters can forward the value with
// minimal translation. Adapters that cannot observe usage may simply not
// emit `usage.updated` events; consumers must treat usage as best-effort.
//
// `inputTokens` / `outputTokens` / cache / cost are treated as **deltas** that
// accumulate across a session. `contextTokensUsed` / `contextWindowSize` are
// **absolute snapshots** of the model context window (Grok ACP's
// `_meta.totalTokens`, ACP `usage_update`, etc.) — latest value wins.
export interface AgentUsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningOutputTokens?: number;
  totalCostUsd?: number;
  /** Absolute tokens currently filling the model context window. */
  contextTokensUsed?: number;
  /** Absolute context window size reported by the agent, when available. */
  contextWindowSize?: number;
}

/** Merge a usage delta into stored session usage (absolute fields replace). */
export function mergeUsageRecords(
  current: AgentUsageRecord | null | undefined,
  delta: AgentUsageRecord,
): AgentUsageRecord {
  return {
    inputTokens: (current?.inputTokens ?? 0) + delta.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + delta.outputTokens,
    cacheCreationInputTokens:
      (current?.cacheCreationInputTokens ?? 0) +
      (delta.cacheCreationInputTokens ?? 0),
    cacheReadInputTokens:
      (current?.cacheReadInputTokens ?? 0) + (delta.cacheReadInputTokens ?? 0),
    reasoningOutputTokens:
      (current?.reasoningOutputTokens ?? 0) +
      (delta.reasoningOutputTokens ?? 0),
    totalCostUsd:
      delta.totalCostUsd == null && current?.totalCostUsd == null
        ? undefined
        : (current?.totalCostUsd ?? 0) + (delta.totalCostUsd ?? 0),
    contextTokensUsed: delta.contextTokensUsed ?? current?.contextTokensUsed,
    contextWindowSize: delta.contextWindowSize ?? current?.contextWindowSize,
  };
}

/** Current context fill, when the adapter provides an absolute snapshot. */
export function getContextUsageTokens(usage: AgentUsageRecord): number | null {
  return typeof usage.contextTokensUsed === "number"
    ? usage.contextTokensUsed
    : null;
}

export interface AgentUsageUpdatedEvent {
  type: "usage.updated";
  sessionId: string;
  usage: AgentUsageRecord;
  /** Defaults to the active user turn; session-only usage is never added to turn stats. */
  attribution?: "active-turn" | "session-only";
  receivedAt: string;
}

export type AgentRateLimitWindowKind =
  | "five-hour"
  | "weekly"
  | "monthly"
  | "primary"
  | "secondary";

export interface AgentRateLimitWindow {
  kind: AgentRateLimitWindowKind;
  usedPercent: number;
  resetsAt?: string;
  windowDurationMinutes?: number;
  // Provider-supplied name for windows that share a `kind` but scope to one
  // model ("Opus", "Sonnet", …). Part of the window identity: without it the
  // per-model weekly buckets would collapse into a single "weekly" row.
  label?: string;
}

// Prepaid balance that keeps working past the plan windows. Money, not a
// window, so it is reported next to them rather than as one of them.
export interface AgentUsageCredits {
  usedAmount: number;
  limitAmount: number;
  currency: string;
}

export interface AgentRateLimitsRecord {
  windows: AgentRateLimitWindow[];
  updatedAt: string;
  // Subscription the windows belong to ("pro", "max", …), when the provider
  // names one.
  planLabel?: string;
  credits?: AgentUsageCredits;
}

export type AgentRateLimitsErrorCode =
  | "authentication-required"
  | "probe-failed"
  | "timed-out";

export type AgentRateLimitsReadResult =
  | {
      status: "available";
      rateLimits: AgentRateLimitsRecord;
    }
  | {
      status: "unavailable";
    }
  | {
      status: "error";
      code: AgentRateLimitsErrorCode;
      message: string;
    };

export interface AgentRateLimitsUpdatedEvent {
  type: "rate_limits.updated";
  sessionId: string;
  rateLimits: AgentRateLimitsRecord;
}

// How the context window is spent, for adapters that can see its composition
// (currently only the Claude Agent SDK, which also backs Claude Code's
// `/context`). Informational only — the footer meter still runs off
// `AgentUsageRecord`, which every adapter can produce.
export interface AgentContextBreakdownItem {
  name: string;
  tokens: number;
  // Secondary label: MCP server name, memory file type, skill source, …
  detail?: string;
}

export type AgentContextBreakdownGroupId =
  | "agents"
  | "deferredTools"
  | "mcpTools"
  | "memoryFiles"
  | "skills"
  | "slashCommands"
  | "systemPrompt"
  | "systemTools";

export interface AgentContextBreakdownGroup {
  id: AgentContextBreakdownGroupId;
  tokens: number;
  // Free-form count summary, e.g. "12/54" for partially included skills.
  summary?: string;
  items: AgentContextBreakdownItem[];
}

export interface AgentContextBreakdownRecord {
  // Top-level slices of the window (system prompt, tools, messages, …), in the
  // order the agent reports them.
  categories: AgentContextBreakdownItem[];
  groups: AgentContextBreakdownGroup[];
  totalTokens: number;
  maxTokens: number;
  model?: string;
  updatedAt: string;
}

export interface AgentContextBreakdownUpdatedEvent {
  type: "context_breakdown.updated";
  sessionId: string;
  breakdown: AgentContextBreakdownRecord;
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
  | AgentErrorEvent;

export interface CreateSessionPayload {
  session: SessionRecord;
  workspaceRootPath: string;
}

export type AgentInputDelivery =
  | "start-new-run"
  | "steer-active-run"
  | "queue-after-run";

export interface SendSessionMessagePayload {
  session: SessionRecord;
  workspaceRootPath: string;
  messageId?: string;
  createdAt?: string;
  content: string;
  attachments?: MessageAttachment[];
  thinkingLevel?: AgentThinkingLevel;
  delivery?: AgentInputDelivery;
}

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

export interface SubmitPreviousMessagePayload
  extends SendSessionMessagePayload {
  messageId: string;
  revertWorkspace: boolean;
}

export interface UpdateSessionTitlePayload {
  sessionId: string;
  title: string;
  expectedTitle?: string | null;
  updatedAt?: string;
}

export interface ArchiveSessionPayload {
  sessionId: string;
  archivedAt?: string;
}

export interface DeleteSessionPayload {
  sessionId: string;
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
  capturedAt: string;
}

export interface EditorViewRecord {
  sessionId: string;
  openFiles: string[];
  activeFile: string | null;
  selections: Array<{ filePath: string; startLine: number; endLine: number }>;
}

// Agents are intentionally absent: detecting installed agent CLIs spawns one
// child process per agent, which is orders of magnitude slower than the SQLite
// reads below. The renderer loads them through `listAgents` in parallel so the
// sidebar does not wait on process spawns.
export interface AppBootstrapData {
  workspaces: WorkspaceRecord[];
  sessions: SessionRecord[];
  messages?: MessageRecord[];
  queuedAgentInputs: QueuedAgentInputRecord[];
  toolCalls?: AgentToolCallRecord[];
  sessionUsage: Record<string, AgentUsageRecord>;
  editorViews: EditorViewRecord[];
}
