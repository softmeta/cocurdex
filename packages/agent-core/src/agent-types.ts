import type {
  AgentCapabilities,
  AgentDescriptor,
  AgentEvent,
  AgentInputDelivery,
  AgentMcpServer,
  AgentPermissionMode,
  AgentPermissionRequestPayload,
  AgentPermissionResolution,
  AgentPlanApprovalDecision,
  AgentPlanApprovalRequestPayload,
  AgentProviderSessionRecord,
  AgentProviderSnapshot,
  AgentQuestionRequestPayload,
  AgentRuntimeProviderConfig,
  AgentSessionConfigOption,
  AgentSessionMode,
  AgentSlashCommand,
  AgentThinkingLevel,
  AgentToolCatalog,
  AgentToolsBinding,
  AgentWorkspaceChangeCapabilities,
  MessageAttachment,
  MessageRecord,
  NativeWorkspaceChangeEvidence,
  NativeWorkspaceRewindInput,
  NativeWorkspaceRewindResult,
  SessionRecord,
} from "@cocurdex/shared";

export type RuntimeProviderConfig = AgentRuntimeProviderConfig;

export type { AgentCapabilities, AgentDescriptor };

export class AgentSteeringUnavailableError extends Error {
  override readonly name = "AgentSteeringUnavailableError";
}

export interface DiscoverAgentCapabilitiesPayload {
  executablePath: string;
}

export interface DiscoveredAgentCapabilities {
  capabilities: Partial<AgentCapabilities>;
  version?: string;
}

export interface AgentToolInvoker {
  catalog(): Promise<AgentToolCatalog>;
  call(name: string, input: unknown): Promise<unknown>;
}

export interface CreateAgentSessionPayload {
  session: SessionRecord;
  workspaceRootPath: string;
  workspaceRootPaths?: string[];
  userDataPath?: string;
  providerConfig?: RuntimeProviderConfig | null;
  providerSession?: AgentProviderSessionRecord | null;
  agentTools?: AgentToolsBinding | null;
  agentToolInvoker?: AgentToolInvoker | null;
  resolveMcpServers?(): Promise<AgentMcpServer[]>;
  onProviderSessionUpdate?(
    providerSession: AgentProviderSessionRecord | null,
  ): void;
  requestPermission?(
    request: AgentPermissionRequestPayload,
  ): Promise<AgentPermissionResolution>;
  requestQuestion?(
    request: AgentQuestionRequestPayload,
  ): Promise<string | null>;
  requestPlanApproval?(
    request: AgentPlanApprovalRequestPayload,
  ): Promise<AgentPlanApprovalDecision>;
}

export interface AgentContextHandoffEntry {
  role: "user" | "assistant";
  text: string;
}

export interface AgentContextHandoff {
  text: string;
  preamble: string;
  entries: AgentContextHandoffEntry[];
}

export interface AgentRunPolicy {
  allowedTools: readonly string[] | null;
  blockedToolReason: string;
  requiredTool: { name: string; reminder: string } | null;
}

export interface SendAgentMessagePayload {
  messageId?: string;
  content: string;
  contextHandoff?: AgentContextHandoff;
  attachments?: MessageAttachment[];
  history: MessageRecord[];
  thinkingLevel?: AgentThinkingLevel;
  sessionModeId?: string | null;
  permissionMode?: AgentPermissionMode | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  providerConfig?: RuntimeProviderConfig | null;
  delivery?: AgentInputDelivery;
  systemSections?: Record<string, string>;
  runPolicy?: AgentRunPolicy | null;
  postedMessages?: readonly string[];
}

export interface AgentSession {
  sendMessage(payload: SendAgentMessagePayload): Promise<MessageRecord>;
  generateTitle?(message: string): Promise<string | null>;
  setTitle?(title: string): Promise<void>;
  setMode?(modeId: string): Promise<void>;
  setConfigOption?(
    configId: string,
    value: boolean | string,
  ): Promise<AgentSessionConfigOption[]>;
  getWorkspaceChangeCapabilities?(): AgentWorkspaceChangeCapabilities;
  collectNativeWorkspaceChanges?(input: {
    userMessageId: string;
    providerTurnId?: string | null;
  }): Promise<NativeWorkspaceChangeEvidence | null>;
  rewindNativeWorkspaceChanges?(
    input: NativeWorkspaceRewindInput,
  ): Promise<NativeWorkspaceRewindResult>;
  /** Its run outlives the daemon process: shutdown disposes it without stopping the run. */
  readonly resumesAfterRestart?: boolean;
  stop(): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export interface ForkProviderSessionPayload {
  source: AgentProviderSessionRecord;
  targetSessionId: string;
  workspaceRootPath: string;
  userTurnCount: number | null;
  userDataPath?: string;
}

export interface ListSlashCommandsPayload {
  workspaceRootPath: string;
  userDataPath?: string;
}

export interface AgentAdapter {
  getDescriptor(): AgentDescriptor;
  discoverCapabilities?(
    payload: DiscoverAgentCapabilitiesPayload,
  ): Promise<DiscoveredAgentCapabilities>;
  discoverSessionModes?(
    payload: DiscoverAgentCapabilitiesPayload,
  ): Promise<AgentSessionMode[]>;
  createSession(
    payload: CreateAgentSessionPayload,
    onEvent: (event: AgentEvent) => void,
  ): AgentSession;
  forkProviderSession?(
    payload: ForkProviderSessionPayload,
  ): Promise<AgentProviderSessionRecord | null>;
  injectsContextHandoff?: boolean;
  runsInProcess?: boolean;
  listSlashCommands?(
    payload: ListSlashCommandsPayload,
  ): Promise<AgentSlashCommand[]>;
}
