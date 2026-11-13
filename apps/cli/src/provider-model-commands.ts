import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type ProviderApi,
  type ProviderModelCapability,
  type ProviderModelRecord,
  preferredProviderModelApi,
  providerApis,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult, stringFlag } from "./parse-args";

const modelCapabilities: readonly ProviderModelCapability[] = [
  "agent",
  "chat",
  "vision",
  "reasoning",
];

export function providerModelUsageLines() {
  return [
    "  cocurdex provider model add <id> <model-id> [--api <api>] [--name <name>]   (--api defaults to the runtime the provider's models use)",
    "  cocurdex provider model set <id> <model-id> [--enable|--disable] [--api <api>] [--context <tokens>|none] [--output <tokens>|none] [--capabilities <a,b>] [--reasoning on|off]",
    "  cocurdex provider model reset <id> <model-id>",
    "  cocurdex provider model remove <id> <model-id>",
  ];
}

function requireModelArgs(
  providerId: string | undefined,
  modelId: string | undefined,
  usage: string,
) {
  if (!providerId || !modelId) throw new Error(`Usage: ${usage}`);
  return { providerId, modelId };
}

function parseProviderApi(value: string): ProviderApi {
  const api = providerApis.find((candidate) => candidate === value);
  if (!api) throw new Error(`--api must be one of: ${providerApis.join(", ")}`);
  return api;
}

function parseLimit(name: string, value: string): number | null {
  if (value === "none") return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--${name} must be a positive integer or none`);
  }
  return limit;
}

function parseCapabilities(value: string): ProviderModelCapability[] {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unknown = items.filter(
    (item) => !modelCapabilities.includes(item as ProviderModelCapability),
  );
  if (unknown.length > 0) {
    throw new Error(
      `--capabilities accepts: ${modelCapabilities.join(", ")} (got ${unknown.join(", ")})`,
    );
  }
  return [...new Set(items)] as ProviderModelCapability[];
}

function parseReasoning(value: string) {
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error("--reasoning must be on or off");
}

function enabledChange(parsed: ParsedArgs) {
  if (parsed.flags.has("disable")) return { enabled: false };
  if (parsed.flags.has("enable")) return { enabled: true };
  return {};
}

export function applyModelFlags(
  model: ProviderModelRecord,
  parsed: ParsedArgs,
): ProviderModelRecord {
  const api = stringFlag(parsed, "api");
  const context = stringFlag(parsed, "context");
  const output = stringFlag(parsed, "output");
  const capabilities = stringFlag(parsed, "capabilities");
  const reasoning = stringFlag(parsed, "reasoning");
  return {
    ...model,
    ...enabledChange(parsed),
    ...(api ? { api: parseProviderApi(api) } : {}),
    ...(context ? { contextLimit: parseLimit("context", context) } : {}),
    ...(output ? { outputLimit: parseLimit("output", output) } : {}),
    ...(capabilities ? { capabilities: parseCapabilities(capabilities) } : {}),
    ...(reasoning ? { reasoning: parseReasoning(reasoning) } : {}),
    updatedAt: new Date().toISOString(),
  };
}

async function findModel(providerId: string, modelId: string) {
  const models = await withDaemon(() =>
    requestDaemon("provider.listAllModels", { providerIds: [providerId] }),
  );
  const model = models.find((candidate) => candidate.modelId === modelId);
  if (!model) throw new Error(`Model not found: ${providerId}/${modelId}`);
  return model;
}

async function resolveNewModelApi(providerId: string, parsed: ParsedArgs) {
  const api = stringFlag(parsed, "api");
  if (api) return parseProviderApi(api);
  const models = await withDaemon(() =>
    requestDaemon("provider.listAllModels", { providerIds: [providerId] }),
  );
  const preferred = preferredProviderModelApi(models);
  if (!preferred) {
    throw new Error(
      `Missing --api: ${providerId} has no models to infer it from`,
    );
  }
  return preferred;
}

async function addModel(args: string[], parsed: ParsedArgs) {
  const { providerId, modelId } = requireModelArgs(
    args[1],
    args[2],
    "cocurdex provider model add <id> <model-id> [--api <api>]",
  );
  const api = await resolveNewModelApi(providerId, parsed);
  const now = new Date().toISOString();
  const model = await withDaemon(() =>
    requestDaemon("provider.model.save", {
      model: {
        providerId,
        modelId,
        name: stringFlag(parsed, "name") ?? modelId,
        api,
        enabled: true,
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
  printResult(model, parsed);
}

async function setModel(args: string[], parsed: ParsedArgs) {
  const { providerId, modelId } = requireModelArgs(
    args[1],
    args[2],
    "cocurdex provider model set <id> <model-id> [flags]",
  );
  const current = await findModel(providerId, modelId);
  const model = await withDaemon(() =>
    requestDaemon("provider.model.save", {
      model: applyModelFlags(current, parsed),
    }),
  );
  printResult(model, parsed);
}

async function resetModel(args: string[], parsed: ParsedArgs) {
  const ids = requireModelArgs(
    args[1],
    args[2],
    "cocurdex provider model reset <id> <model-id>",
  );
  const model = await withDaemon(() =>
    requestDaemon("provider.model.reset", ids),
  );
  printResult(model, parsed);
}

async function removeModel(args: string[], parsed: ParsedArgs) {
  const ids = requireModelArgs(
    args[1],
    args[2],
    "cocurdex provider model remove <id> <model-id>",
  );
  await withDaemon(() => requestDaemon("provider.model.delete", ids));
  printResult({ removed: true, ...ids }, parsed);
}

const modelSubcommands: Record<
  string,
  (args: string[], parsed: ParsedArgs) => Promise<void>
> = {
  add: addModel,
  set: setModel,
  reset: resetModel,
  remove: removeModel,
};

export async function handleModelCommand(args: string[], parsed: ParsedArgs) {
  const handler = modelSubcommands[args[0] ?? ""];
  if (!handler) {
    throw new Error("Usage: cocurdex provider model add|set|reset|remove ...");
  }
  await handler(args, parsed);
}
