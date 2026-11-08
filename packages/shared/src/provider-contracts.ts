import type {
  AgentId,
  AgentThinkingLevel,
  CodexServiceTierOption,
  ProviderApi,
  ProviderModelCapability,
  ProviderModelSource,
  ReasoningEffort,
  ReasoningEffortOption,
} from "./contracts";

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

export type ProviderAuthOrigin = "stored" | "ambient";

export interface ProviderAuthState {
  providerId: string;
  type: ProviderAuthMethod | null;
  origin: ProviderAuthOrigin | null;
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
  defaultReasoningEffort?: Exclude<AgentThinkingLevel, "default"> | null;
  supportedReasoningEfforts?: ReasoningEffortOption[];
  serviceTiers?: CodexServiceTierOption[];
  supportsFastMode?: boolean;
  isDefault?: boolean;
  overridden?: boolean;
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
