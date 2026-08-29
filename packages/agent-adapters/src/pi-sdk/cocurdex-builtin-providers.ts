import type {
  ProviderApi,
  ProviderModelCapability,
  ProviderModelRecord,
  ProviderTemplateRecord,
} from "@cocurdex/shared";

// Cocurdex-only built-in providers that are not yet (or never) in pi-ai's
// catalog. Shape mirrors ~/.pi/agent/models.json custom providers so the
// settings preset list and model picker stay in sync with pi CLI configs.
interface CocurdexBuiltinModelDef {
  id: string;
  name: string;
  input: ("text" | "image")[];
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
}

interface CocurdexBuiltinProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  api: ProviderApi;
  models: readonly CocurdexBuiltinModelDef[];
}

// Volcengine (火山方舟) Coding Plan — OpenAI Responses endpoint.
// Source: common pi agent models.json (volcengine-plan).
const volcengineCodingPlan: CocurdexBuiltinProviderDef = {
  id: "volcengine-plan",
  name: "火山 Coding Plan",
  baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
  api: "openai-responses",
  models: [
    {
      id: "ark-code-latest",
      name: "ark-code-latest",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
    {
      id: "doubao-seed-code",
      name: "doubao-seed-code",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
    {
      id: "glm-5.2",
      name: "glm-5.2",
      input: ["text"],
      contextWindow: 1_024_000,
      maxTokens: 4096,
    },
    {
      id: "glm-latest",
      name: "glm-latest",
      input: ["text"],
      contextWindow: 1_024_000,
      maxTokens: 4096,
    },
    {
      id: "deepseek-v4-flash",
      name: "deepseek-v4-flash",
      input: ["text"],
      contextWindow: 1_024_000,
      maxTokens: 4096,
    },
    {
      id: "deepseek-v4-pro",
      name: "deepseek-v4-pro",
      input: ["text"],
      contextWindow: 1_024_000,
      maxTokens: 4096,
    },
    {
      id: "doubao-seed-2.0-code",
      name: "doubao-seed-2.0-code",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
    {
      id: "doubao-seed-2.0-pro",
      name: "doubao-seed-2.0-pro",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
    {
      id: "doubao-seed-2.0-lite",
      name: "doubao-seed-2.0-lite",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
    {
      id: "minimax-m2.7",
      name: "minimax-m2.7",
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 4096,
    },
    {
      id: "minimax-m3",
      name: "minimax-m3",
      input: ["text", "image"],
      contextWindow: 512_000,
      maxTokens: 4096,
    },
    {
      id: "kimi-k2.6",
      name: "kimi-k2.6",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
    {
      id: "kimi-k2.7-code",
      name: "kimi-k2.7-code",
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 4096,
    },
  ],
};

const cocurdexBuiltinProviders: readonly CocurdexBuiltinProviderDef[] = [
  volcengineCodingPlan,
];

function modelCapabilities(
  model: CocurdexBuiltinModelDef,
): ProviderModelCapability[] {
  const capabilities: ProviderModelCapability[] = ["agent", "chat"];

  if (model.input.includes("image")) {
    capabilities.push("vision");
  }

  if (model.reasoning) {
    capabilities.push("reasoning");
  }

  return capabilities;
}

export function listCocurdexBuiltinProviderTemplates(): ProviderTemplateRecord[] {
  return cocurdexBuiltinProviders.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
  }));
}

export function listCocurdexBuiltinProviderIds(): string[] {
  return cocurdexBuiltinProviders.map((provider) => provider.id);
}

export function listCocurdexBuiltinProviderModels(
  providerId: string,
): ProviderModelRecord[] | null {
  const provider = cocurdexBuiltinProviders.find(
    (item) => item.id === providerId,
  );
  if (!provider) {
    return null;
  }

  const now = new Date().toISOString();
  return provider.models.map(
    (model): ProviderModelRecord => ({
      providerId: provider.id,
      modelId: model.id,
      name: model.name,
      api: provider.api,
      enabled: true,
      source: "api",
      baseUrl: null,
      contextLimit: model.contextWindow,
      outputLimit: model.maxTokens,
      capabilities: modelCapabilities(model),
      reasoning: model.reasoning ?? false,
      thinkingLevelMapJson: null,
      costJson: null,
      compatJson: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
}
