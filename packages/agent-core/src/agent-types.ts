import type {
  AgentCapabilities,
  AgentDescriptor,
  AgentEvent,
  AgentInputDelivery,
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

export interface SendAgentMessagePayload {
  messageId?: string;
  content: string;
  attachments?: MessageAttachment[];
  history: MessageRecord[];
  thinkingLevel?: AgentThinkingLevel;
  sessionModeId?: string | null;
  // Carried per turn (not just at session creation) so adapters that can switch
  // it live — e.g. Grok Build over ACP — see the user's latest choice.
  permissionMode?: AgentPermissionMode | null;
  // Same reason: model / reasoning effort / service tier can change mid-session
  // (Codex), so adapters must read the latest snapshot instead of the copy
  // captured when the session runtime was created.
  providerSnapshot?: AgentProviderSnapshot | null;
  // Current provider credentials/catalog entry for an in-session model change.
  // Adapters must apply this through their native session API, never by
  // recreating the session.
  providerConfig?: RuntimeProviderConfig | null;
  delivery?: AgentInputDelivery;
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
  // Abandon the in-flight turn without ending the provider session: the next
  // sendMessage must be able to continue the same conversation.
  stop(): void | Promise<void>;
  // Async for runtimes that own a child process: teardown has to be awaited or
  // the daemon can exit before the agent has reaped its own tool processes.
  dispose(): void | Promise<void>;
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
  /**
   * Modes the agent offers, learned by talking to it. ACP agents only reveal
   * their list once a session is opened, so this is asked for on demand rather
   * than during the agent listing every client waits on.
   */
  discoverSessionModes?(
    payload: DiscoverAgentCapabilitiesPayload,
  ): Promise<AgentSessionMode[]>;
  createSession(
    payload: CreateAgentSessionPayload,
    onEvent: (event: AgentEvent) => void,
  ): AgentSession;
  /** List skills available through the composer's slash-triggered picker. */
  listSlashCommands?(
    payload: ListSlashCommandsPayload,
  ): Promise<AgentSlashCommand[]>;
}
