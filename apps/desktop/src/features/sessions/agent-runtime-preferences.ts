import type {
  AgentId,
  AgentPermissionMode,
  AgentThinkingLevel,
  ReasoningEffort,
} from "@cocurdex/shared";

export interface AgentRuntimePreferences {
  providerSelection?: {
    providerId: string;
    modelId: string;
  };
  permissionMode?: AgentPermissionMode | null;
  reasoningEffort?: ReasoningEffort | null;
  serviceTier?: string | null;
  fastMode?: boolean | null;
  thinkingLevel?: AgentThinkingLevel | null;
  openCodeAgent?: string | null;
  openCodeVariant?: string | null;
}

export const AGENT_RUNTIME_PREFERENCES_STORAGE_KEY =
  "cocurdex:agent-runtime-preferences:v1";

const agentIds = new Set<AgentId>([
  "claude-agent",
  "codex",
  "grok-build",
  "opencode",
  "pi",
]);

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAgentId(value: string): value is AgentId {
  return agentIds.has(value as AgentId);
}

function readNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function parsePreference(value: unknown): AgentRuntimePreferences | null {
  if (!isRecord(value)) {
    return null;
  }

  const preference: AgentRuntimePreferences = {};
  if (
    isRecord(value.providerSelection) &&
    typeof value.providerSelection.providerId === "string" &&
    typeof value.providerSelection.modelId === "string"
  ) {
    preference.providerSelection = {
      providerId: value.providerSelection.providerId,
      modelId: value.providerSelection.modelId,
    };
  }

  const permissionMode = readNullableString(value.permissionMode);
  if (permissionMode !== undefined) {
    preference.permissionMode = permissionMode as AgentPermissionMode | null;
  }

  const reasoningEffort = readNullableString(value.reasoningEffort);
  if (reasoningEffort !== undefined) {
    preference.reasoningEffort = reasoningEffort as ReasoningEffort | null;
  }

  const serviceTier = readNullableString(value.serviceTier);
  if (serviceTier !== undefined) {
    preference.serviceTier = serviceTier;
  }

  if (typeof value.fastMode === "boolean") {
    preference.fastMode = value.fastMode;
  }

  const thinkingLevel = readNullableString(value.thinkingLevel);
  if (thinkingLevel !== undefined) {
    preference.thinkingLevel = thinkingLevel as AgentThinkingLevel | null;
  }

  const openCodeAgent = readNullableString(value.openCodeAgent);
  if (openCodeAgent !== undefined) {
    preference.openCodeAgent = openCodeAgent;
  }

  const openCodeVariant = readNullableString(value.openCodeVariant);
  if (openCodeVariant !== undefined) {
    preference.openCodeVariant = openCodeVariant;
  }

  return preference;
}

function readAllPreferences(): Partial<
  Record<AgentId, AgentRuntimePreferences>
> {
  const storage = getStorage();
  let raw: string | null = null;
  try {
    raw = storage?.getItem(AGENT_RUNTIME_PREFERENCES_STORAGE_KEY) ?? null;
  } catch {
    return {};
  }

  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([agentId, value]) => {
        if (!isAgentId(agentId)) {
          return [];
        }

        const preference = parsePreference(value);
        return preference ? [[agentId, preference]] : [];
      }),
    ) as Partial<Record<AgentId, AgentRuntimePreferences>>;
  } catch {
    return {};
  }
}

export function getAgentRuntimePreferences(
  agentId: AgentId,
): AgentRuntimePreferences {
  return readAllPreferences()[agentId] ?? {};
}

export function updateAgentRuntimePreferences(
  agentId: AgentId,
  patch: AgentRuntimePreferences,
) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const preferences = readAllPreferences();
  preferences[agentId] = {
    ...preferences[agentId],
    ...patch,
  };

  try {
    storage.setItem(
      AGENT_RUNTIME_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Keep the in-memory UI state usable when storage is unavailable or full.
  }
}
