import type { AgentProviderSnapshot } from "@cocurdex/shared";

export interface OpenCodePromptSelection {
  agent?: string;
  variant?: string;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

export function getOpenCodePromptSelection(
  snapshot: AgentProviderSnapshot | null | undefined,
): OpenCodePromptSelection {
  const compat =
    getOpenCodeCompat(snapshot?.modelCompatJson) ??
    getOpenCodeCompat(snapshot?.providerCompatJson);

  return {
    agent:
      getNonEmptyString(snapshot?.openCodeAgent) ??
      getNonEmptyString(compat?.agent),
    variant:
      getNonEmptyString(snapshot?.openCodeVariant) ??
      getNonEmptyString(compat?.variant),
  };
}
