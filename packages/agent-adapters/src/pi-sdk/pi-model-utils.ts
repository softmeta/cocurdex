import type { RuntimeProviderConfig } from "@cocurdex/agent-core";

export function parseHeaders(headersJson?: string | null) {
  if (!headersJson) {
    return undefined;
  }

  const parsed = JSON.parse(headersJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider headers must be a JSON object");
  }

  return parsed as Record<string, string>;
}

export function parseJsonObject(json?: string | null) {
  if (!json) {
    return undefined;
  }

  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed as Record<string, unknown>;
}

export function buildModelCost(costJson?: string | null) {
  const cost = parseJsonObject(costJson) ?? {};
  return {
    input: getNumber(cost.input) ?? 0,
    output: getNumber(cost.output) ?? 0,
    cacheRead: getNumber(cost.cacheRead) ?? 0,
    cacheWrite: getNumber(cost.cacheWrite) ?? 0,
  };
}

export function buildModelInput(
  capabilities?: RuntimeProviderConfig["modelCapabilities"],
): ("text" | "image")[] {
  if (!capabilities || capabilities.length === 0) {
    return ["text", "image"];
  }

  return capabilities.includes("vision") ? ["text", "image"] : ["text"];
}

export function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
