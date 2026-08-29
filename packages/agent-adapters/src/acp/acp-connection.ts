import type {
  AuthenticateRequest,
  AuthenticateResponse,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from "@agentclientprotocol/sdk";

// `session/set_model` is not in the ACP TypeScript SDK's typed method map yet,
// so the request/response shape lives here. `_meta.reasoningEffort` is how
// Grok Build takes a thinking level for the session.
export interface SetSessionModelRequest {
  sessionId: string;
  modelId: string;
  _meta?: Record<string, unknown>;
}

export interface AcpConnection {
  initialize(request: InitializeRequest): Promise<InitializeResponse>;
  authenticate(request: AuthenticateRequest): Promise<AuthenticateResponse>;
  newSession(request: NewSessionRequest): Promise<NewSessionResponse>;
  loadSession(request: LoadSessionRequest): Promise<LoadSessionResponse>;
  resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResponse>;
  setSessionMode(
    request: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse>;
  setSessionConfigOption(
    request: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse>;
  setSessionModel(request: SetSessionModelRequest): Promise<unknown>;
  // Vendor extension channel (`_unstable` in ACP terms): fire-and-forget
  // notifications outside the standard method set, e.g. Grok Build's
  // `x.ai/yolo_mode_changed` permission switch.
  extNotification(
    method: string,
    params: Record<string, unknown>,
  ): Promise<void>;
  // Vendor extension request/response channel (`_unstable` in ACP terms).
  extRequest(method: string, params: Record<string, unknown>): Promise<unknown>;
  prompt(request: PromptRequest): Promise<PromptResponse>;
  cancel(request: {
    sessionId: string;
    _meta?: Record<string, unknown>;
  }): Promise<void>;
  // Resolves once the agent process is gone: teardown is staged (stdin EOF,
  // then signals) so the agent can reap the tool processes it owns.
  close(): Promise<void>;
}

// Wire types for Grok Build's `x.ai/exit_plan_mode` reverse-request. See
// xai-grok-tools `implementations/grok_build/exit_plan_mode/types.rs` — the
// agent serializes camelCase and reads `outcome` back as a bare string.
export interface AcpExitPlanModeRequest {
  sessionId: string;
  toolCallId: string;
  planContent?: string | null;
}

export interface AcpExitPlanModeResponse {
  outcome: string;
  feedback?: string;
}

export interface AcpConnectionHandlers {
  onSessionUpdate(notification: SessionNotification): Promise<void> | void;
  // Vendor extension notifications the agent pushes on its own (Grok Build's
  // `x.ai/mcp/server_status`). Only the methods listed in
  // `AcpConnectionFactoryOptions.extNotificationMethods` are dispatched here;
  // the params stay on the wire because callers re-read the authoritative
  // state instead of patching it from the push.
  onExtNotification?(method: string): void;
  requestPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  // Only agents that park plan approval on the client implement this. Leaving
  // it unhandled makes the agent's tool call fail, so the adapter always wires
  // it when the agent can enter plan mode.
  exitPlanMode?(
    request: AcpExitPlanModeRequest,
  ): Promise<AcpExitPlanModeResponse>;
}

export interface AcpConnectionFactoryOptions {
  args: string[];
  command: string;
  cwd: string;
  extNotificationMethods?: string[];
  handlers: AcpConnectionHandlers;
}

export type AcpConnectionFactory = (
  options: AcpConnectionFactoryOptions,
) => Promise<AcpConnection>;
