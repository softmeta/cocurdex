import type { AgentAdapter } from "@cocurdex/agent-core";
import type {
  AgentRateLimitsRecord,
  CompatibleProviderModel,
} from "@cocurdex/shared";

export interface AgentModelListOptions {
  forceRefresh?: boolean;
}

export interface AgentConversationTitleInput {
  message: string;
  modelId?: string;
  signal?: AbortSignal;
}

export interface AgentRuntimePlugin {
  createAdapter(): AgentAdapter;
  slashCommands: "adapter" | "skills";
  listModels?(
    options: AgentModelListOptions,
  ): Promise<CompatibleProviderModel[]>;
  generateConversationTitle?(
    input: AgentConversationTitleInput,
  ): Promise<string | null>;
  deleteProviderSession?(providerSessionId: string): Promise<void>;
  readPlanUsage?(): Promise<AgentRateLimitsRecord | null>;
}
