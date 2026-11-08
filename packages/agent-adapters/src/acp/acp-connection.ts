import type {
  AuthenticateRequest,
  AuthenticateResponse,
  ForkSessionRequest,
  ForkSessionResponse,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  LogoutRequest,
  LogoutResponse,
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
} from "@agentclientprotocol/sdk/unstable";

export interface SetSessionModelRequest {
  sessionId: string;
  modelId: string;
  _meta?: Record<string, unknown>;
}

export interface AcpConnection {
  initialize(request: InitializeRequest): Promise<InitializeResponse>;
  authenticate(request: AuthenticateRequest): Promise<AuthenticateResponse>;
  logout(request: LogoutRequest): Promise<LogoutResponse>;
  newSession(request: NewSessionRequest): Promise<NewSessionResponse>;
  loadSession(request: LoadSessionRequest): Promise<LoadSessionResponse>;
  resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResponse>;
  forkSession(request: ForkSessionRequest): Promise<ForkSessionResponse>;
  setSessionMode(
    request: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse>;
  setSessionConfigOption(
    request: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse>;
  setSessionModel(request: SetSessionModelRequest): Promise<unknown>;
  extNotification(
    method: string,
    params: Record<string, unknown>,
  ): Promise<void>;
  extRequest(method: string, params: Record<string, unknown>): Promise<unknown>;
  prompt(request: PromptRequest): Promise<PromptResponse>;
  cancel(request: {
    sessionId: string;
    _meta?: Record<string, unknown>;
  }): Promise<void>;
  close(): Promise<void>;
}

export interface AcpConnectionHandlers {
  onSessionUpdate(notification: SessionNotification): Promise<void> | void;
  onExtNotification?(method: string, params: unknown): void;
  requestPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  onClose?(): void;
  onExtRequest?(method: string, params: unknown): Promise<unknown>;
}

export interface AcpLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface AcpConnectionFactoryOptions {
  args: string[];
  command: string;
  cwd: string;
  env?: Record<string, string>;
  extNotificationMethods?: string[];
  extRequestMethods?: string[];
  handlers: AcpConnectionHandlers;
}

export type AcpConnectionFactory = (
  options: AcpConnectionFactoryOptions,
) => Promise<AcpConnection>;
