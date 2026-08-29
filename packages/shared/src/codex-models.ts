import type { CompatibleProviderModel } from "./contracts";

export const CODEX_BUILT_IN_PROVIDER_ID = "codex";
export const CODEX_DEFAULT_MODEL_ID = "gpt-5.5";

export const codexBuiltInProviderModel: CompatibleProviderModel = {
  provider: {
    id: CODEX_BUILT_IN_PROVIDER_ID,
    name: "Codex",
    baseUrl: "",
    enabled: true,
    apiKeySecretId: null,
    headersJson: null,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  },
  model: {
    providerId: CODEX_BUILT_IN_PROVIDER_ID,
    modelId: CODEX_DEFAULT_MODEL_ID,
    name: "GPT-5.5",
    api: "openai-responses",
    enabled: true,
    source: "manual",
    contextLimit: null,
    outputLimit: null,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      {
        reasoningEffort: "low",
        description: "Lower latency",
      },
      {
        reasoningEffort: "medium",
        description: "Balanced",
      },
      {
        reasoningEffort: "high",
        description: "Deeper reasoning",
      },
      {
        reasoningEffort: "xhigh",
        description: "Maximum reasoning",
      },
    ],
    serviceTiers: [],
    isDefault: true,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  },
};
