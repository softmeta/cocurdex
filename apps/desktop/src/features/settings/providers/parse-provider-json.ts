import {
  type ProviderApi,
  type ProviderConfigRecord,
  type ProviderModelCapability,
  type ProviderModelRecord,
  providerApis,
} from "@cocurdex/shared";

// Pi `~/.pi/agent/models.json` shape (coding-agent docs/models.md).
// Supports the full file `{ "providers": { ... } }` or a bare providers map.

const SUPPORTED_APIS = new Set<string>(providerApis);
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

/** Stable codes so the UI can translate; pure parse stays locale-free. */
export type ProviderImportWarningCode =
  | "envApiKey"
  | "commandApiKey"
  | "oauthIgnored"
  | "authHeaderNoKey";

export interface ProviderImportWarning {
  code: ProviderImportWarningCode;
  providerId: string;
}

export interface ParsedProviderImport {
  provider: ProviderConfigRecord;
  models: ProviderModelRecord[];
  /** Literal API key only; `$ENV` / `!command` values are left null with a warning. */
  apiKey: string | null;
  warnings: ProviderImportWarning[];
}

export type ParseProviderJsonResult =
  | {
      ok: true;
      providers: ParsedProviderImport[];
      warnings: ProviderImportWarning[];
    }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderApi(value: unknown): value is ProviderApi {
  return typeof value === "string" && SUPPORTED_APIS.has(value);
}

/** Strip `//` line comments and trailing commas, leaving string literals intact. */
export function stripJsonComments(input: string): string {
  return input
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) =>
      match[0] === '"' ? match : "",
    )
    .replace(
      /"(?:\\.|[^"\\])*"|,(\s*[}\]])/g,
      (match, tail: string | undefined) =>
        tail ?? (match[0] === '"' ? match : ""),
    );
}

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function modelCapabilities(
  input: readonly string[] | undefined,
  reasoning: boolean | undefined,
): ProviderModelCapability[] {
  const capabilities: ProviderModelCapability[] = ["agent", "chat"];
  if (input?.includes("image")) {
    capabilities.push("vision");
  }
  if (reasoning) {
    capabilities.push("reasoning");
  }
  return capabilities;
}

/**
 * Pi config values: `!command`, `$ENV` / `${ENV}`, or a literal key.
 * Desktop import only persists literals — env/command refs need the user to
 * paste a real key (we do not shell out from a pasted blob).
 */
export function resolveImportApiKey(value: string | undefined): {
  apiKey: string | null;
  warningCode?: Extract<
    ProviderImportWarningCode,
    "envApiKey" | "commandApiKey"
  >;
} {
  if (value === undefined) {
    return { apiKey: null };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { apiKey: null };
  }
  if (trimmed.startsWith("!")) {
    return { apiKey: null, warningCode: "commandApiKey" };
  }
  if (trimmed.includes("$")) {
    return { apiKey: null, warningCode: "envApiKey" };
  }
  return { apiKey: trimmed };
}

function looksLikeProviderConfig(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.baseUrl === "string" ||
    Array.isArray(value.models) ||
    isRecord(value.headers) ||
    isRecord(value.compat) ||
    typeof value.api === "string" ||
    typeof value.apiKey === "string"
  );
}

function extractProvidersMap(
  parsed: unknown,
): { providers: Record<string, unknown> } | { error: string } {
  if (!isRecord(parsed)) {
    return { error: "JSON root must be an object." };
  }

  if (isRecord(parsed.providers)) {
    return { providers: parsed.providers };
  }

  // Bare providers map: { "ollama": { "baseUrl": "...", "models": [...] } }
  const keys = Object.keys(parsed);
  if (
    keys.length > 0 &&
    keys.every((key) => looksLikeProviderConfig(parsed[key]))
  ) {
    return { providers: parsed };
  }

  return {
    error:
      'Expected pi models.json shape: { "providers": { "<id>": { "baseUrl", "api", "models": [...] } } }.',
  };
}

function parseModel(
  providerId: string,
  providerApi: ProviderApi | undefined,
  providerBaseUrl: string,
  providerCompatJson: string | null,
  modelDef: unknown,
  index: number,
  now: string,
): { model: ProviderModelRecord } | { error: string } {
  if (!isRecord(modelDef)) {
    return { error: `models[${index}] must be an object.` };
  }

  const modelId = typeof modelDef.id === "string" ? modelDef.id.trim() : "";
  if (!modelId) {
    return { error: `models[${index}].id is required.` };
  }

  const modelApiRaw = modelDef.api ?? providerApi;
  if (!isProviderApi(modelApiRaw)) {
    return {
      error: `models[${index}] (${modelId}): api must be one of ${providerApis.join(", ")}.`,
    };
  }

  const name =
    typeof modelDef.name === "string" && modelDef.name.trim()
      ? modelDef.name.trim()
      : modelId;

  const baseUrl =
    typeof modelDef.baseUrl === "string" && modelDef.baseUrl.trim()
      ? modelDef.baseUrl.trim()
      : null;

  const reasoning =
    typeof modelDef.reasoning === "boolean" ? modelDef.reasoning : false;

  const input = Array.isArray(modelDef.input)
    ? modelDef.input.filter((item): item is string => typeof item === "string")
    : undefined;

  const contextLimit =
    typeof modelDef.contextWindow === "number" &&
    Number.isFinite(modelDef.contextWindow)
      ? modelDef.contextWindow
      : DEFAULT_CONTEXT_WINDOW;

  const outputLimit =
    typeof modelDef.maxTokens === "number" &&
    Number.isFinite(modelDef.maxTokens)
      ? modelDef.maxTokens
      : DEFAULT_MAX_TOKENS;

  const modelCompatJson =
    modelDef.compat !== undefined
      ? serializeJson(modelDef.compat)
      : providerCompatJson;

  return {
    model: {
      providerId,
      modelId,
      name,
      api: modelApiRaw,
      enabled: true,
      source: "manual",
      // Only store per-model baseUrl when it differs from the provider default.
      baseUrl: baseUrl && baseUrl !== providerBaseUrl ? baseUrl : null,
      contextLimit,
      outputLimit,
      capabilities: modelCapabilities(input, reasoning),
      reasoning,
      thinkingLevelMapJson:
        modelDef.thinkingLevelMap !== undefined
          ? serializeJson(modelDef.thinkingLevelMap)
          : null,
      costJson:
        modelDef.cost !== undefined ? serializeJson(modelDef.cost) : null,
      compatJson: modelCompatJson,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function parseProviderEntry(
  providerId: string,
  raw: unknown,
  now: string,
): ParsedProviderImport | { error: string } {
  if (!providerId.trim()) {
    return { error: "Provider id must be a non-empty string." };
  }
  if (!isRecord(raw)) {
    return { error: `Provider "${providerId}" must be an object.` };
  }

  const warnings: ProviderImportWarning[] = [];
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  const hasModels = Array.isArray(raw.models);

  if (!baseUrl) {
    return {
      error: `Provider "${providerId}": baseUrl is required.`,
    };
  }

  const providerApi = isProviderApi(raw.api) ? raw.api : undefined;
  if (raw.api !== undefined && !providerApi) {
    return {
      error: `Provider "${providerId}": api must be one of ${providerApis.join(", ")}.`,
    };
  }

  if (raw.oauth !== undefined) {
    warnings.push({ code: "oauthIgnored", providerId });
  }

  const headersJson =
    raw.headers !== undefined ? serializeJson(raw.headers) : null;
  const compatJson =
    raw.compat !== undefined ? serializeJson(raw.compat) : null;

  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : providerId;

  const { apiKey, warningCode: apiKeyWarningCode } = resolveImportApiKey(
    typeof raw.apiKey === "string" ? raw.apiKey : undefined,
  );
  if (apiKeyWarningCode) {
    warnings.push({ code: apiKeyWarningCode, providerId });
  }

  // authHeader is handled by the runtime API-key path; nothing to persist.
  if (raw.authHeader === true && !apiKey && !apiKeyWarningCode) {
    warnings.push({ code: "authHeaderNoKey", providerId });
  }

  const models: ProviderModelRecord[] = [];
  if (hasModels) {
    if (!providerApi) {
      // Models may each declare api; only require provider.api when a model omits it.
      const needsProviderApi = (raw.models as unknown[]).some((modelDef) => {
        if (!isRecord(modelDef)) {
          return true;
        }
        return modelDef.api === undefined;
      });
      if (needsProviderApi) {
        return {
          error: `Provider "${providerId}": api is required when models omit per-model api (one of ${providerApis.join(", ")}).`,
        };
      }
    }

    for (const [index, modelDef] of (raw.models as unknown[]).entries()) {
      const result = parseModel(
        providerId,
        providerApi,
        baseUrl,
        compatJson,
        modelDef,
        index,
        now,
      );
      if ("error" in result) {
        return { error: `Provider "${providerId}": ${result.error}` };
      }
      models.push(result.model);
    }
  }

  const provider: ProviderConfigRecord = {
    id: providerId,
    name,
    baseUrl,
    enabled: true,
    apiKeySecretId: null,
    headersJson,
    compatJson,
    createdAt: now,
    updatedAt: now,
  };

  return { provider, models, apiKey, warnings };
}

export function parseProviderJson(
  input: string,
  now: string = new Date().toISOString(),
): ParseProviderJsonResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "JSON is empty." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(trimmed));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  const extracted = extractProvidersMap(parsed);
  if ("error" in extracted) {
    return { ok: false, error: extracted.error };
  }

  const providerIds = Object.keys(extracted.providers);
  if (providerIds.length === 0) {
    return { ok: false, error: "No providers found in JSON." };
  }

  const providers: ParsedProviderImport[] = [];
  const topWarnings: ProviderImportWarning[] = [];

  for (const providerId of providerIds) {
    const entry = parseProviderEntry(
      providerId,
      extracted.providers[providerId],
      now,
    );
    if ("error" in entry) {
      return { ok: false, error: entry.error };
    }
    providers.push(entry);
    topWarnings.push(...entry.warnings);
  }

  return { ok: true, providers, warnings: topWarnings };
}
