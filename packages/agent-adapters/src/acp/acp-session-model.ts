import type { AgentThinkingLevel } from "@cocurdex/shared";

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

export function toAcpReasoningEffort(level: AgentThinkingLevel): string {
  return level === "off" ? "none" : level;
}

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
