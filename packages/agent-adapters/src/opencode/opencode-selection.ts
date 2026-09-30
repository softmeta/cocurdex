import type { AgentProviderSnapshot } from "@cocurdex/shared";
import { isPlanModeId } from "@cocurdex/shared";
import type { ModelRef } from "@opencode/client";

export const OPENCODE_BUILD_AGENT = "build";
const OPENCODE_PLAN_AGENT = "plan";

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

export interface OpenCodeSessionSelection {
  agent: string;
  model: ModelRef | null;
}

export function getSessionSelection(
  sessionModeId: string | null | undefined,
  snapshot: AgentProviderSnapshot | null | undefined,
): OpenCodeSessionSelection {
  const promptSelection = getOpenCodePromptSelection(snapshot);
  return {
    agent: isPlanModeId(sessionModeId)
      ? OPENCODE_PLAN_AGENT
      : (promptSelection.agent ?? OPENCODE_BUILD_AGENT),
    model: snapshot
      ? {
          providerID: snapshot.providerId,
          id: snapshot.modelId,
          ...(promptSelection.variant
            ? { variant: promptSelection.variant }
            : {}),
        }
      : null,
  };
}

export function isSameModel(left: ModelRef | null, right: ModelRef | null) {
  return (
    left?.providerID === right?.providerID &&
    left?.id === right?.id &&
    left?.variant === right?.variant
  );
}
