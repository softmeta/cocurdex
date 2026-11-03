import {
  type ProviderModelCapability,
  type ProviderModelRecord,
  providerApis,
} from "./contracts";

export const providerModelOverrideFields = [
  "enabled",
  "api",
  "contextLimit",
  "outputLimit",
  "capabilities",
  "reasoning",
  "thinkingLevelMapJson",
  "costJson",
  "compatJson",
] as const;

export type ProviderModelOverrideField =
  (typeof providerModelOverrideFields)[number];

export type ProviderModelOverride = Partial<
  Pick<ProviderModelRecord, ProviderModelOverrideField>
>;

const providerModelCapabilities: readonly ProviderModelCapability[] = [
  "agent",
  "chat",
  "vision",
  "reasoning",
];

function storedValue(
  model: Partial<ProviderModelRecord>,
  field: ProviderModelOverrideField,
): unknown {
  const value = model[field];
  if (field === "capabilities") return value ?? [];
  if (field === "reasoning") return value ?? false;
  if (field === "enabled") return value ?? true;
  return value ?? null;
}

function comparableValue(
  model: Partial<ProviderModelRecord>,
  field: ProviderModelOverrideField,
) {
  const value = storedValue(model, field);
  const comparable = Array.isArray(value) ? [...value].sort() : value;
  return JSON.stringify(comparable);
}

export function diffProviderModelOverride(
  base: ProviderModelRecord,
  edited: Partial<ProviderModelRecord>,
): ProviderModelOverride {
  const override: Record<string, unknown> = {};
  for (const field of providerModelOverrideFields) {
    if (comparableValue(edited, field) !== comparableValue(base, field)) {
      override[field] = storedValue(edited, field);
    }
  }
  return override as ProviderModelOverride;
}

export function applyProviderModelOverride(
  base: ProviderModelRecord,
  override: ProviderModelOverride,
): ProviderModelRecord {
  if (Object.keys(override).length === 0) return base;
  return { ...base, ...override, overridden: true };
}

function isLimit(value: unknown) {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value > 0)
  );
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

const fieldValidators: Record<
  ProviderModelOverrideField,
  (value: unknown) => boolean
> = {
  enabled: (value) => typeof value === "boolean",
  api: (value) =>
    typeof value === "string" &&
    (providerApis as readonly string[]).includes(value),
  contextLimit: isLimit,
  outputLimit: isLimit,
  capabilities: (value) =>
    Array.isArray(value) &&
    value.every((item) =>
      providerModelCapabilities.includes(item as ProviderModelCapability),
    ),
  reasoning: (value) => typeof value === "boolean",
  thinkingLevelMapJson: isNullableString,
  costJson: isNullableString,
  compatJson: isNullableString,
};

export function parseProviderModelOverride(
  json: string,
): ProviderModelOverride {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  const override: Record<string, unknown> = {};
  for (const field of providerModelOverrideFields) {
    if (field in record && fieldValidators[field](record[field])) {
      override[field] = record[field];
    }
  }
  return override as ProviderModelOverride;
}
