import type {
  AgentProviderSnapshot,
  ProviderModelRecord,
} from "@cocurdex/shared";

export interface OpenCodeRuntimeOptions {
  agents: string[];
  variants: string[];
}

export function getDefaultOpenCodeAgent(
  options: OpenCodeRuntimeOptions,
): string {
  return (
    options.agents.find((agent) => agent === "build") ?? options.agents[0] ?? ""
  );
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseCompatJson(value: string | null | undefined) {
  if (!value) return null;

  try {
    return getRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function getOpenCodeCompat(value: string | null | undefined) {
  const record = parseCompatJson(value);
  if (!record) return null;

  return getRecord(record.opencode) ?? record;
}

function getStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  // OpenCode's own "default" entry is the empty selection in the picker, so it
  // is folded into that row instead of being listed twice.
  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.length > 0 && entry !== "default",
  );
}

export function getOpenCodeRuntimeOptions(
  model: ProviderModelRecord | null | undefined,
  snapshot?: AgentProviderSnapshot | null,
): OpenCodeRuntimeOptions {
  const compatRecords = [
    getOpenCodeCompat(model?.compatJson),
    getOpenCodeCompat(snapshot?.modelCompatJson),
    getOpenCodeCompat(snapshot?.providerCompatJson),
  ].filter((record): record is Record<string, unknown> => record !== null);
  const agents = new Set<string>();
  const variants = new Set<string>();

  for (const compat of compatRecords) {
    for (const agent of getStringList(compat.agents)) agents.add(agent);
    for (const variant of getStringList(compat.variants)) variants.add(variant);
  }

  return {
    agents: [...agents],
    variants: [...variants],
  };
}

export function resolveOpenCodeRuntimeValue(
  value: string | null | undefined,
  options: readonly string[],
) {
  return value && options.includes(value) ? value : "";
}
