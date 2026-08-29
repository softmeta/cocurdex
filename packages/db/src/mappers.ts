import type {
  AgentProviderSelection,
  AgentProviderSessionRecord,
  AgentProviderSnapshot,
  AgentToolCallRecord,
  CollaborationModeKind,
  ConversationContentPart,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSource,
  ConversationUsage,
  EditorViewRecord,
  MessageRecord,
  ProviderApi,
  ProviderConfigRecord,
  ProviderModelCapability,
  ProviderModelRecord,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import type { ProviderSecretRecord } from "./repositories";
import {
  parseJson,
  type SqliteRow,
  toBoolean,
  toNullableNumber,
  toNullableString,
} from "./sqlite-types";

function isCollaborationMode(value: unknown): value is CollaborationModeKind {
  return value === "default" || value === "plan";
}

export function mapWorkspace(row: SqliteRow): WorkspaceRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastOpenedAt: String(row.last_opened_at),
  };
}

export function mapSession(row: SqliteRow): SessionRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    agentType: row.agent_type as SessionRecord["agentType"],
    sessionKind:
      row.session_kind === "subagent" || row.session_kind === "main"
        ? row.session_kind
        : "main",
    parentSessionId: toNullableString(row.parent_session_id),
    parentToolCallId: toNullableString(row.parent_tool_call_id),
    status: row.status as SessionRecord["status"],
    writeMode: row.write_mode as SessionRecord["writeMode"],
    collaborationMode: isCollaborationMode(row.collaboration_mode)
      ? row.collaboration_mode
      : "default",
    permissionMode:
      typeof row.permission_mode === "string" && row.permission_mode
        ? (row.permission_mode as SessionRecord["permissionMode"])
        : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastMessageAt:
      typeof row.last_message_at === "string" ? row.last_message_at : null,
    archivedAt: toNullableString(row.archived_at),
    providerSnapshot: parseJson<AgentProviderSnapshot | null>(
      row.provider_snapshot_json,
      null,
    ),
  };
}

export function mapMessage(row: SqliteRow): MessageRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as MessageRecord["role"],
    kind:
      row.kind === "reasoning" || row.kind === "response"
        ? row.kind
        : undefined,
    content: String(row.content),
    attachments: parseJson(row.attachments_json, []),
    createdAt: String(row.created_at),
  };
}

export function mapToolCall(row: SqliteRow): AgentToolCallRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    title: String(row.title),
    kind: toNullableString(row.kind),
    status: row.status as AgentToolCallRecord["status"],
    content: parseJson<AgentToolCallRecord["content"]>(row.content_json, []),
    rawInput: parseJson(row.raw_input_json, null),
    rawOutput: parseJson(row.raw_output_json, null),
    locations: parseJson<AgentToolCallRecord["locations"]>(
      row.locations_json,
      [],
    ),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
  };
}

// Summary variant that leaves rawOutput as `undefined` so callers can detect
// the field hasn't been loaded yet and fetch it lazily. Distinct from `null`,
// which means "loaded and the column was empty".
export function mapToolCallSummary(row: SqliteRow): AgentToolCallRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    title: String(row.title),
    kind: toNullableString(row.kind),
    status: row.status as AgentToolCallRecord["status"],
    content: undefined,
    rawInput: parseJson(row.raw_input_json, null),
    rawOutput: undefined,
    locations: parseJson<AgentToolCallRecord["locations"]>(
      row.locations_json,
      [],
    ),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapEditorView(row: SqliteRow): EditorViewRecord {
  return {
    sessionId: String(row.session_id),
    openFiles: parseJson<string[]>(row.open_files_json, []),
    activeFile: typeof row.active_file === "string" ? row.active_file : null,
    selections: parseJson<EditorViewRecord["selections"]>(
      row.selections_json,
      [],
    ),
  };
}

export function mapProviderSession(row: SqliteRow): AgentProviderSessionRecord {
  return {
    sessionId: String(row.session_id),
    providerSessionId: toNullableString(row.provider_session_id),
    providerStateJson: String(row.provider_state_json),
    providerVersion: toNullableString(row.provider_version),
    resumable: toBoolean(row.resumable),
    updatedAt: String(row.updated_at),
  };
}

export function mapProviderConfig(row: SqliteRow): ProviderConfigRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    baseUrl: String(row.base_url),
    enabled: toBoolean(row.enabled),
    apiKeySecretId: toNullableString(row.api_key_secret_id),
    headersJson: toNullableString(row.headers_json),
    compatJson: toNullableString(row.compat_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseJsonArray(value: unknown): unknown[] {
  const raw = toNullableString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapProviderModel(row: SqliteRow): ProviderModelRecord {
  return {
    providerId: String(row.provider_id),
    modelId: String(row.model_id),
    name: String(row.name),
    api: String(row.api) as ProviderApi,
    enabled: toBoolean(row.enabled),
    source: row.source === "api" ? "api" : "manual",
    contextLimit: toNullableNumber(row.context_limit),
    outputLimit: toNullableNumber(row.output_limit),
    capabilities: parseJsonArray(row.capabilities_json).filter(
      (capability): capability is ProviderModelCapability =>
        capability === "agent" ||
        capability === "chat" ||
        capability === "vision" ||
        capability === "reasoning",
    ),
    reasoning: toBoolean(row.reasoning),
    thinkingLevelMapJson: toNullableString(row.thinking_level_map_json),
    costJson: toNullableString(row.cost_json),
    compatJson: toNullableString(row.compat_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapProviderSecret(row: SqliteRow): ProviderSecretRecord {
  return {
    id: String(row.id),
    encryptedValue: String(row.encrypted_value),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapConversation(row: SqliteRow): ConversationRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    providerId: String(row.provider_id),
    modelId: String(row.model_id),
    systemPrompt: toNullableString(row.system_prompt),
    presetId: toNullableString(row.preset_id),
    webSearchEnabled: toBoolean(row.web_search_enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastMessageAt: toNullableString(row.last_message_at),
    archivedAt: toNullableString(row.archived_at),
  };
}

export function mapConversationMessage(
  row: SqliteRow,
): ConversationMessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: row.role as ConversationMessageRecord["role"],
    content: parseJson<ConversationContentPart[]>(row.content_json, []),
    status: row.status as ConversationMessageRecord["status"],
    usage: parseJson<ConversationUsage | null>(row.usage_json, null),
    sources: parseJson<ConversationSource[]>(row.sources_json, []),
    error: toNullableString(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapAgentDefault(row: SqliteRow): AgentProviderSelection {
  return {
    agentId: String(row.agent_id) as AgentProviderSelection["agentId"],
    providerId: String(row.provider_id),
    modelId: String(row.model_id),
    isDefault: toBoolean(row.is_default),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
