import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawnCommand } from "@cocurdex/agent-adapters";

const ENDPOINT_FILE = "endpoint.json";
const TOKEN_FILE = "token";
const PROBE_TIMEOUT_MS = 3_000;
const START_TIMEOUT_MS = 20_000;
const START_POLL_MS = 200;

export interface RuntimeEndpoint {
  url: string;
  token: string;
  bin: string | null;
  pid: number | null;
}

export interface RuntimeToolCatalog {
  at: number;
  tools: Map<string, Set<string>>;
}

function runtimeDir(dataDir?: string) {
  return path.join(dataDir ?? path.join(homedir(), ".rsrs"), "runtime");
}

async function readJsonFile(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function readRuntimeEndpoint(
  dataDir?: string,
): Promise<RuntimeEndpoint | null> {
  const directory = runtimeDir(dataDir);
  const [endpoint, token] = await Promise.all([
    readJsonFile(path.join(directory, ENDPOINT_FILE)),
    readFile(path.join(directory, TOKEN_FILE), "utf8").catch(() => null),
  ]);
  const url = typeof endpoint?.url === "string" ? endpoint.url.trim() : "";
  const trimmedToken = token?.trim() ?? "";
  if (!url || !trimmedToken) return null;
  return {
    url,
    token: trimmedToken,
    bin: typeof endpoint?.bin === "string" ? endpoint.bin : null,
    pid: typeof endpoint?.pid === "number" ? endpoint.pid : null,
  };
}

async function postRpc(
  endpoint: RuntimeEndpoint,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const response = await fetch(`${endpoint.url}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${endpoint.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`rsrs runtime returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (payload.error) {
    throw new Error(payload.error.message ?? "rsrs runtime call failed");
  }
  return payload.result;
}

function toolText(result: unknown) {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    const text = (block as { text?: unknown })?.text;
    if (typeof text === "string" && text.trim()) return text;
  }
  return null;
}

export async function callRuntimeTool(
  endpoint: RuntimeEndpoint,
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const result = await postRpc(
    endpoint,
    {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: args },
    },
    timeoutMs,
  );
  const text = toolText(result);
  if (!text) throw new Error(`rsrs runtime tool ${name} returned no payload`);
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`rsrs runtime tool ${name} returned an unexpected payload`);
  }
  return parsed as Record<string, unknown>;
}

export async function listRuntimeTools(
  endpoint: RuntimeEndpoint,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<Map<string, Set<string>>> {
  const result = await postRpc(
    endpoint,
    { jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/list" },
    timeoutMs,
  );
  const tools = (result as { tools?: unknown })?.tools;
  const catalog = new Map<string, Set<string>>();
  if (!Array.isArray(tools)) return catalog;
  for (const tool of tools) {
    const name = (tool as { name?: unknown })?.name;
    if (typeof name !== "string") continue;
    const properties = (tool as { inputSchema?: { properties?: unknown } })
      ?.inputSchema?.properties;
    const args =
      properties && typeof properties === "object"
        ? new Set(Object.keys(properties))
        : new Set<string>();
    catalog.set(name, args);
  }
  return catalog;
}

export async function runtimeIsAlive(endpoint: RuntimeEndpoint) {
  try {
    await listRuntimeTools(endpoint);
    return true;
  } catch {
    return false;
  }
}

export async function ensureRuntime(input: {
  command: string;
  dataDir?: string;
  timeoutMs?: number;
  autoStart?: boolean;
  now?: () => number;
}): Promise<RuntimeEndpoint | null> {
  const existing = await readRuntimeEndpoint(input.dataDir);
  if (existing && (await runtimeIsAlive(existing))) return existing;
  if (input.autoStart === false) return null;

  const child = spawnCommand(input.command, ["--runtime-internal"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  const timeoutMs = input.timeoutMs ?? START_TIMEOUT_MS;
  const now = input.now ?? Date.now;
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, START_POLL_MS));
    const endpoint = await readRuntimeEndpoint(input.dataDir);
    if (endpoint && (await runtimeIsAlive(endpoint))) return endpoint;
  }
  return null;
}
