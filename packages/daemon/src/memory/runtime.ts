import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const ENDPOINT_FILE = "endpoint.json";
const RUNTIME_PROTOCOL_VERSION = 1;
const PROBE_TIMEOUT_MS = 3_000;

export interface RuntimeEndpoint {
  url: string;
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

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readEndpointUrl(dataDir?: string) {
  try {
    const raw = await readFile(
      path.join(runtimeDir(dataDir), ENDPOINT_FILE),
      "utf8",
    );
    const url = asObject(JSON.parse(raw))?.url;
    return typeof url === "string" && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

export async function probeRuntime(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<RuntimeEndpoint | null> {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const health = asObject(await response.json());
    if (health?.server !== "respire") return null;
    if (health.v !== RUNTIME_PROTOCOL_VERSION) return null;
    const version = health.runtime_version ?? health.bin;
    return {
      url,
      bin: typeof version === "string" ? version : null,
      pid: typeof health.pid === "number" ? health.pid : null,
    };
  } catch {
    return null;
  }
}

export async function findRuntime(
  dataDir?: string,
): Promise<RuntimeEndpoint | null> {
  const url = await readEndpointUrl(dataDir);
  return url ? probeRuntime(url) : null;
}

async function postRpc(
  endpoint: RuntimeEndpoint,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const response = await fetch(`${endpoint.url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  if ((result as { isError?: unknown })?.isError === true) {
    throw new Error(text);
  }
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
