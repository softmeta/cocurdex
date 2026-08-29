import type { AgentThinkingLevel } from "@cocurdex/shared";

// `session/new` reports the model catalog in a field the ACP TypeScript SDK
// does not type yet (models + per-model `_meta`). Grok Build carries context
// window and the selectable reasoning efforts there, so we read the shape
// defensively.
/** One reasoning level exactly as the agent describes it. */
export interface AcpReasoningEffort {
  value: string;
  label: string | null;
  description: string | null;
}

export interface AcpSessionModel {
  modelId: string;
  name: string | null;
  description: string | null;
  contextWindow: number | null;
  defaultReasoningEffort: string | null;
  reasoningEfforts: AcpReasoningEffort[];
}

export interface AcpSessionModelState {
  currentModelId: string | null;
  models: AcpSessionModel[];
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readEfforts(meta: Record<string, unknown>): AcpReasoningEffort[] {
  if (meta.supportsReasoningEffort !== true) {
    return [];
  }
  const raw = meta.reasoningEfforts;
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();

  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const value = readString(record, "value");

    if (!value || seen.has(value)) {
      return [];
    }

    seen.add(value);
    // Label and description are the agent's own copy; keep them so the picker
    // can show its vocabulary instead of ours.
    return [
      {
        value,
        label: readString(record, "label"),
        description: readString(record, "description"),
      },
    ];
  });
}

function readModel(entry: unknown): AcpSessionModel | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const modelId = readString(record, "modelId");
  if (!modelId) {
    return null;
  }
  const meta =
    typeof record._meta === "object" && record._meta !== null
      ? (record._meta as Record<string, unknown>)
      : {};
  const contextWindow = meta.totalContextTokens;

  return {
    modelId,
    name: readString(record, "name"),
    description: readString(record, "description"),
    contextWindow: typeof contextWindow === "number" ? contextWindow : null,
    defaultReasoningEffort: readString(meta, "reasoningEffort"),
    reasoningEfforts: readEfforts(meta),
  };
}

// The same model-state shape reaches us from two places: `session/new` puts it
// on `models`, while `initialize` reports the bundled snapshot under
// `_meta.modelState`. Grok's live catalog is `x.ai/models/list`, not this
// initialize field.
function readModelStateField(response: unknown): unknown {
  if (typeof response !== "object" || response === null) {
    return null;
  }
  const record = response as Record<string, unknown>;
  if (record.models) {
    return record.models;
  }
  const meta = record._meta;
  if (typeof meta !== "object" || meta === null) {
    return null;
  }
  return (meta as Record<string, unknown>).modelState ?? null;
}

export function readAcpSessionModelState(
  response: unknown,
): AcpSessionModelState | null {
  const models = readModelStateField(response);
  if (typeof models !== "object" || models === null) {
    return null;
  }
  const modelsRecord = models as Record<string, unknown>;
  const available = Array.isArray(modelsRecord.availableModels)
    ? modelsRecord.availableModels
    : [];

  return {
    currentModelId: readString(modelsRecord, "currentModelId"),
    models: available.flatMap((entry) => {
      const model = readModel(entry);
      return model ? [model] : [];
    }),
  };
}

// Only apply a requested model when the agent advertised it in its own ACP
// catalog. This keeps the adapter from forwarding a stale or foreign provider
// selection to a third-party runtime.
export function resolveAcpModelId(
  state: AcpSessionModelState | null,
  requestedModelId: string | null | undefined,
): string | null {
  const modelId = requestedModelId?.trim();
  if (!state || !modelId) {
    return null;
  }
  return state.models.some((model) => model.modelId === modelId)
    ? modelId
    : null;
}

// Cocurdex's neutral "off" maps to the agent's explicit "none" effort; every
// other level shares the agent vocabulary (minimal/low/medium/high/xhigh).
export function toAcpReasoningEffort(level: AgentThinkingLevel): string {
  return level === "off" ? "none" : level;
}

// Returns the effort to send for `modelId`, or null when the model does not
// advertise it — sending an unsupported effort is silently dropped by the agent
// and would leave our UI claiming a level that never applied.
export function resolveAcpReasoningEffort(
  state: AcpSessionModelState | null,
  modelId: string | null,
  level: AgentThinkingLevel | undefined,
): string | null {
  if (!state || !modelId || !level) {
    return null;
  }
  const effort = toAcpReasoningEffort(level);
  return state.models
    .find((model) => model.modelId === modelId)
    ?.reasoningEfforts.some((option) => option.value === effort)
    ? effort
    : null;
}
