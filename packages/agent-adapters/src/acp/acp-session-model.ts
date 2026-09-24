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
  /** Session "speed" axis values (Devin's `standard`/`fast`), per model. */
  defaultSpeed: string | null;
  speedOptions: AcpReasoningEffort[];
}

export interface AcpSessionModelState {
  currentModelId: string | null;
  models: AcpSessionModel[];
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readEffortEntry(
  entry: unknown,
  seen: Set<string>,
): AcpReasoningEffort[] {
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
  // can show its vocabulary instead of ours. Config-option choices spell the
  // label `name` while model metadata spells it `label`.
  return [
    {
      value,
      label: readString(record, "label") ?? readString(record, "name"),
      description: readString(record, "description"),
    },
  ];
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

  return raw.flatMap((entry) => readEffortEntry(entry, seen));
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
    defaultSpeed: null,
    speedOptions: [],
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

function readConfigOptionModel(entry: unknown): AcpSessionModel | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const modelId = readString(record, "value") ?? readString(record, "modelId");
  if (!modelId) {
    return null;
  }
  return {
    modelId,
    name: readString(record, "name") ?? modelId,
    description: readString(record, "description"),
    contextWindow: null,
    defaultReasoningEffort: null,
    reasoningEfforts: [],
    defaultSpeed: null,
    speedOptions: [],
  };
}

function isModelConfigOption(record: Record<string, unknown>) {
  if (readString(record, "type") !== "select") {
    return false;
  }
  const id = readString(record, "id");
  const category = readString(record, "category");
  return id === "model" || category === "model";
}

// Agents that keep effort or speed off the model metadata expose each as a
// session config option instead (Devin's `thought_level`, `speed`). The keys
// normalize the id/category spellings agents use for those axes.
const EFFORT_CONFIG_OPTION_KEYS = new Set([
  "effort",
  "reasoning",
  "reasoning_effort",
  "thinking",
  "thinking_level",
  "thought_level",
]);

const SPEED_CONFIG_OPTION_KEYS = new Set([
  "speed",
  "service_tier",
  "fast_mode",
  "fastmode",
]);

export interface AcpSessionSelectConfig {
  configId: string;
  currentValue: string | null;
  options: AcpReasoningEffort[];
}

function normalizeConfigKey(value: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") ?? ""
  );
}

function isSelectConfigOption(
  record: Record<string, unknown>,
  keys: ReadonlySet<string>,
) {
  if (readString(record, "type") !== "select") {
    return false;
  }
  return (
    keys.has(normalizeConfigKey(readString(record, "id"))) ||
    keys.has(normalizeConfigKey(readString(record, "category")))
  );
}

function readEffortConfigOptions(raw: unknown): AcpReasoningEffort[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  // Config options may nest their choices under a `group` entry's options.
  const entries = raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    return Array.isArray(record.options) ? record.options : [entry];
  });
  const seen = new Set<string>();
  return entries.flatMap((entry) => readEffortEntry(entry, seen));
}

function readSessionSelectConfig(
  response: unknown,
  keys: ReadonlySet<string>,
): AcpSessionSelectConfig | null {
  if (typeof response !== "object" || response === null) {
    return null;
  }
  const configOptions = (response as Record<string, unknown>).configOptions;
  if (!Array.isArray(configOptions)) {
    return null;
  }
  for (const option of configOptions) {
    if (typeof option !== "object" || option === null) {
      continue;
    }
    const record = option as Record<string, unknown>;
    if (!isSelectConfigOption(record, keys)) {
      continue;
    }
    const configId = readString(record, "id");
    const options = readEffortConfigOptions(record.options);
    if (!configId || options.length === 0) {
      continue;
    }
    return {
      configId,
      currentValue: readString(record, "currentValue"),
      options,
    };
  }
  return null;
}

export function readAcpSessionEffortConfig(
  response: unknown,
): AcpSessionSelectConfig | null {
  return readSessionSelectConfig(response, EFFORT_CONFIG_OPTION_KEYS);
}

export function readAcpSessionSpeedConfig(
  response: unknown,
): AcpSessionSelectConfig | null {
  return readSessionSelectConfig(response, SPEED_CONFIG_OPTION_KEYS);
}

const BASELINE_SPEED_VALUES = new Set(["default", "normal", "standard"]);

export function isBaselineAcpSpeedValue(value: string): boolean {
  return BASELINE_SPEED_VALUES.has(normalizeConfigKey(value));
}

// The value a speed option rests at when nothing is selected — Devin's
// "standard". Everything else becomes a named tier in the picker.
export function baselineAcpSpeedValue(
  config: AcpSessionSelectConfig,
): string | null {
  const baseline = config.options.find((option) =>
    isBaselineAcpSpeedValue(option.value),
  );
  return baseline?.value ?? config.options[0]?.value ?? null;
}

function readModelStateFromConfigOptions(
  response: Record<string, unknown>,
): AcpSessionModelState | null {
  const configOptions = response.configOptions;
  if (!Array.isArray(configOptions)) {
    return null;
  }
  // Session-scoped effort/speed options describe only the session's current
  // model — Devin adds and removes them as the model changes, so they must
  // not be merged onto every advertised model.
  const effort = readAcpSessionEffortConfig(response);
  const speed = readAcpSessionSpeedConfig(response);
  for (const option of configOptions) {
    if (typeof option !== "object" || option === null) {
      continue;
    }
    const record = option as Record<string, unknown>;
    if (!isModelConfigOption(record) || !Array.isArray(record.options)) {
      continue;
    }
    const models = record.options.flatMap((entry) => {
      const model = readConfigOptionModel(entry);
      return model ? [model] : [];
    });
    if (models.length === 0) {
      continue;
    }
    const currentModelId = readString(record, "currentValue");
    return {
      currentModelId,
      models: models.map((model) =>
        model.modelId === currentModelId
          ? {
              ...model,
              defaultReasoningEffort: effort?.currentValue ?? null,
              reasoningEfforts: effort?.options ?? [],
              defaultSpeed: speed?.currentValue ?? null,
              speedOptions: speed?.options ?? [],
            }
          : model,
      ),
    };
  }
  return null;
}

export function readAcpModelConfigOptionId(response: unknown): string | null {
  if (typeof response !== "object" || response === null) {
    return null;
  }
  const configOptions = (response as Record<string, unknown>).configOptions;
  if (!Array.isArray(configOptions)) {
    return null;
  }
  for (const option of configOptions) {
    if (typeof option !== "object" || option === null) {
      continue;
    }
    const record = option as Record<string, unknown>;
    if (!isModelConfigOption(record)) {
      continue;
    }
    return readString(record, "id");
  }
  return null;
}

export function readAcpSessionModelState(
  response: unknown,
): AcpSessionModelState | null {
  const models = readModelStateField(response);
  if (typeof models === "object" && models !== null) {
    const modelsRecord = models as Record<string, unknown>;
    const available = Array.isArray(modelsRecord.availableModels)
      ? modelsRecord.availableModels
      : [];
    const parsed = available.flatMap((entry) => {
      const model = readModel(entry);
      return model ? [model] : [];
    });
    if (parsed.length > 0) {
      return {
        currentModelId: readString(modelsRecord, "currentModelId"),
        models: parsed,
      };
    }
  }
  if (typeof response === "object" && response !== null) {
    return readModelStateFromConfigOptions(response as Record<string, unknown>);
  }
  return null;
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
