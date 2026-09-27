import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type AgentId,
  isAgentId,
  type ProviderApi,
  type ProviderAuthMethod,
  type ProviderConfigRecord,
  providerApis,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import {
  createTextLoginUi,
  createTuiLoginUi,
  type ProviderLoginClient,
  runProviderLogin,
} from "./provider-login";

export function providerUsageLines() {
  return [
    "  cocurdex provider list [--json]",
    "  cocurdex provider templates [--json]",
    "  cocurdex provider add <id> [--template <template-id>] [--name <name>] [--base-url <url>]",
    "  cocurdex provider update <id> [--name <name>] [--base-url <url>] [--enable|--disable]",
    "  cocurdex provider remove <id>",
    "  cocurdex provider status <id> [--json]",
    "  cocurdex provider login <id> [--method oauth|api_key] [--no-tui]",
    "  cocurdex provider logout <id>",
    "  cocurdex provider key set <id>   (reads the key from stdin)",
    "  cocurdex provider key clear <id>",
    "  cocurdex provider models <id> [--refresh] [--json]",
    "  cocurdex provider model add <id> <model-id> --api <api> [--name <name>]",
    "  cocurdex provider model remove <id> <model-id>",
    "  cocurdex provider default [--agent <agent>] [--provider <id> --model <model-id>] [--json]",
  ];
}

function requireArg<T extends string>(value: T | undefined, usage: string): T {
  if (!value) throw new Error(`Usage: ${usage}`);
  return value;
}

async function getProvider(providerId: string) {
  const provider = await withDaemon(() =>
    requestDaemon("provider.config.get", { providerId }),
  );
  if (!provider) throw new Error(`Provider not found: ${providerId}`);
  return provider;
}

function enabledFlag(parsed: ParsedArgs, current: boolean) {
  if (parsed.flags.has("disable")) return false;
  if (parsed.flags.has("enable")) return true;
  return current;
}

async function addProvider(providerId: string, parsed: ParsedArgs) {
  const existing = await withDaemon(() =>
    requestDaemon("provider.config.get", { providerId }),
  );
  if (existing) throw new Error(`Provider already exists: ${providerId}`);
  const templateId = stringFlag(parsed, "template");
  const template = templateId
    ? (await withDaemon(() => requestDaemon("provider.listTemplates"))).find(
        (candidate) => candidate.id === templateId,
      )
    : undefined;
  if (templateId && !template) {
    throw new Error(`Provider template not found: ${templateId}`);
  }
  const name = stringFlag(parsed, "name") ?? template?.name ?? providerId;
  const baseUrl = stringFlag(parsed, "base-url") ?? template?.baseUrl;
  if (!baseUrl) throw new Error("Missing required --base-url or --template");
  const now = new Date().toISOString();
  const provider: ProviderConfigRecord = {
    id: providerId,
    name,
    baseUrl,
    enabled: enabledFlag(parsed, true),
    apiKeySecretId: null,
    headersJson: null,
    compatJson: null,
    createdAt: now,
    updatedAt: now,
  };
  return withDaemon(() =>
    requestDaemon("provider.config.save", { config: provider }),
  );
}

async function updateProvider(providerId: string, parsed: ParsedArgs) {
  const current = await getProvider(providerId);
  const provider: ProviderConfigRecord = {
    ...current,
    name: stringFlag(parsed, "name") ?? current.name,
    baseUrl: stringFlag(parsed, "base-url") ?? current.baseUrl,
    enabled: enabledFlag(parsed, current.enabled),
    updatedAt: new Date().toISOString(),
  };
  return withDaemon(() =>
    requestDaemon("provider.config.save", { config: provider }),
  );
}

async function readSecretFromTerminal(query: string) {
  const discard = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const readline = createInterface({
    input: process.stdin,
    output: discard,
    terminal: true,
  });
  process.stdout.write(query);
  try {
    return await readline.question("");
  } finally {
    process.stdout.write("\n");
    readline.close();
  }
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readApiKey() {
  const value = process.stdin.isTTY
    ? await readSecretFromTerminal("API key: ")
    : await readStdin();
  const apiKey = value.trim();
  if (!apiKey) throw new Error("API key is empty");
  return apiKey;
}

function parseAuthMethod(parsed: ParsedArgs): ProviderAuthMethod {
  const method = stringFlag(parsed, "method") ?? "oauth";
  if (method !== "oauth" && method !== "api_key") {
    throw new Error("--method must be oauth or api_key");
  }
  return method;
}

const daemonLoginClient: ProviderLoginClient = {
  start: (providerId, method) =>
    requestDaemon("provider.auth.login.start", { providerId, method }),
  next: (loginId) => requestDaemon("provider.auth.login.next", { loginId }),
  respond: async (loginId, promptId, value) => {
    await requestDaemon("provider.auth.login.respond", {
      loginId,
      promptId,
      value,
    });
  },
  cancel: async (loginId) => {
    await requestDaemon("provider.auth.login.cancel", { loginId });
  },
};

async function loginProvider(providerId: string, parsed: ParsedArgs) {
  const method = parseAuthMethod(parsed);
  const provider = await getProvider(providerId);
  const useTui =
    !parsed.flags.has("no-tui") &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const ui = useTui
    ? await createTuiLoginUi(providerId, provider.name)
    : createTextLoginUi();
  try {
    await withDaemon(() =>
      runProviderLogin(daemonLoginClient, ui, providerId, method),
    );
  } finally {
    ui.close();
  }
  console.log(`Logged in to ${provider.name}`);
}

async function handleKeyCommand(args: string[]) {
  const [subaction, providerId] = args;
  const usage = "cocurdex provider key set|clear <id>";
  requireArg(providerId, usage);
  if (subaction === "set") {
    const apiKey = await readApiKey();
    await withDaemon(() =>
      requestDaemon("provider.apiKey.set", { providerId, apiKey }),
    );
    console.log(`API key saved for ${providerId}`);
    return;
  }
  if (subaction === "clear") {
    await withDaemon(() =>
      requestDaemon("provider.apiKey.set", { providerId, apiKey: null }),
    );
    console.log(`API key cleared for ${providerId}`);
    return;
  }
  throw new Error(`Usage: ${usage}`);
}

function parseProviderApi(value: string): ProviderApi {
  const api = providerApis.find((candidate) => candidate === value);
  if (!api) throw new Error(`--api must be one of: ${providerApis.join(", ")}`);
  return api;
}

async function handleModelCommand(args: string[], parsed: ParsedArgs) {
  const [subaction, providerId, modelId] = args;
  if (subaction === "add") {
    const usage = "cocurdex provider model add <id> <model-id> --api <api>";
    requireArg(providerId, usage);
    requireArg(modelId, usage);
    const now = new Date().toISOString();
    const model = await withDaemon(() =>
      requestDaemon("provider.model.save", {
        model: {
          providerId,
          modelId,
          name: stringFlag(parsed, "name") ?? modelId,
          api: parseProviderApi(getRequiredFlag(parsed, "api")),
          enabled: true,
          source: "manual",
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    printResult(model, parsed);
    return;
  }
  if (subaction === "remove") {
    const usage = "cocurdex provider model remove <id> <model-id>";
    requireArg(providerId, usage);
    requireArg(modelId, usage);
    await withDaemon(() =>
      requestDaemon("provider.model.delete", { providerId, modelId }),
    );
    printResult({ removed: true, providerId, modelId }, parsed);
    return;
  }
  throw new Error("Usage: cocurdex provider model add|remove ...");
}

async function listModels(providerId: string | undefined, parsed: ParsedArgs) {
  const columns = ["providerId", "modelId", "name", "api", "enabled"] as const;
  if (parsed.flags.has("refresh")) {
    const id = requireArg(
      providerId,
      "cocurdex provider models <id> --refresh",
    );
    const result = await withDaemon(() =>
      requestDaemon("provider.fetchModels", { providerId: id }),
    );
    if (result.error) throw new Error(result.error);
    printRows(result.models, [...columns], parsed);
    return;
  }
  const models = await withDaemon(() =>
    requestDaemon("provider.listAllModels", {
      providerIds: providerId ? [providerId] : undefined,
    }),
  );
  printRows(models, [...columns], parsed);
}

function parseAgentFlag(parsed: ParsedArgs): AgentId | undefined {
  const agent = stringFlag(parsed, "agent");
  if (agent !== undefined && !isAgentId(agent)) {
    throw new Error(`Unknown agent: ${agent}`);
  }
  return agent;
}

async function handleDefaultCommand(parsed: ParsedArgs) {
  const agentId = parseAgentFlag(parsed);
  if (parsed.flags.has("provider") || parsed.flags.has("model")) {
    const agent = requireArg(
      agentId,
      "cocurdex provider default --agent <agent> --provider <id> --model <model-id>",
    );
    await withDaemon(() =>
      requestDaemon("provider.default.set", {
        agentId: agent,
        providerId: getRequiredFlag(parsed, "provider"),
        modelId: getRequiredFlag(parsed, "model"),
      }),
    );
  }
  const defaults = await withDaemon(() =>
    requestDaemon("provider.listDefaults"),
  );
  printRows(
    defaults.filter((item) => !agentId || item.agentId === agentId),
    ["agentId", "providerId", "modelId"],
    parsed,
  );
}

export async function handleProviderCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  const [providerId] = args;
  switch (action) {
    case undefined:
    case "list": {
      const providers = await withDaemon(() =>
        requestDaemon("provider.listConfigs"),
      );
      printRows(providers, ["id", "name", "baseUrl", "enabled"], parsed);
      return true;
    }
    case "templates": {
      const templates = await withDaemon(() =>
        requestDaemon("provider.listTemplates"),
      );
      printRows(
        templates.map((template) => ({
          ...template,
          auth: (template.authMethods ?? []).map((m) => m.type).join(","),
        })),
        ["id", "name", "baseUrl", "auth"],
        parsed,
      );
      return true;
    }
    case "add":
      printResult(
        await addProvider(
          requireArg(providerId, "cocurdex provider add <id> ..."),
          parsed,
        ),
        parsed,
      );
      return true;
    case "update":
      printResult(
        await updateProvider(
          requireArg(providerId, "cocurdex provider update <id> ..."),
          parsed,
        ),
        parsed,
      );
      return true;
    case "remove": {
      const id = requireArg(providerId, "cocurdex provider remove <id>");
      await withDaemon(() =>
        requestDaemon("provider.config.delete", { providerId: id }),
      );
      printResult({ removed: true, providerId: id }, parsed);
      return true;
    }
    case "status": {
      const id = requireArg(providerId, "cocurdex provider status <id>");
      printResult(
        await withDaemon(() =>
          requestDaemon("provider.auth.read", { providerId: id }),
        ),
        parsed,
      );
      return true;
    }
    case "login":
      await loginProvider(
        requireArg(providerId, "cocurdex provider login <id>"),
        parsed,
      );
      return true;
    case "logout": {
      const id = requireArg(providerId, "cocurdex provider logout <id>");
      await withDaemon(() =>
        requestDaemon("provider.auth.logout", { providerId: id }),
      );
      console.log(`Logged out of ${id}`);
      return true;
    }
    case "key":
      await handleKeyCommand(args);
      return true;
    case "models":
      await listModels(providerId, parsed);
      return true;
    case "model":
      await handleModelCommand(args, parsed);
      return true;
    case "default":
      await handleDefaultCommand(parsed);
      return true;
    default:
      return false;
  }
}
