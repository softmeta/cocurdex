import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const ENDPOINT_FILE = "endpoint.json";
const RUNTIME_PROTOCOL_VERSION = 1;
const PROBE_TIMEOUT_MS = 3_000;

export interface RuntimeRequestScope {
  account_id: string;
  instance_id: string;
  generation: number;
}

export interface RuntimeEndpoint {
  url: string;
  runtimeVersion: string | null;
  pid: number | null;
  scope?: RuntimeRequestScope | null;
}

export interface RsrsReply {
  payload: Record<string, unknown>;
  exit: number | null;
}

export class RuntimeUnreachableError extends Error {
  override name = "RuntimeUnreachableError";
}

function resolveDataDir(dataDir?: string) {
  return path.resolve(dataDir ?? path.join(homedir(), ".rsrs"));
}

function runtimeDir(dataDir?: string) {
  return path.join(resolveDataDir(dataDir), "runtime");
}

async function canonicalPath(value: string) {
  return realpath(value).catch(() => path.resolve(value));
}

async function samePath(a: string, b: string, platform: NodeJS.Platform) {
  const [left, right] = await Promise.all([canonicalPath(a), canonicalPath(b)]);
  const caseInsensitive = platform === "win32" || platform === "darwin";
  return caseInsensitive
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
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

function healthScope(
  health: Record<string, unknown>,
): RuntimeRequestScope | null {
  const { account_id, instance_id, generation } = health;
  if (
    typeof account_id !== "string" ||
    !account_id ||
    typeof instance_id !== "string" ||
    !instance_id ||
    typeof generation !== "number" ||
    generation <= 0
  ) {
    return null;
  }
  return { account_id, instance_id, generation };
}

// The endpoint file can outlive its runtime, and the port it names may then be
// served by a runtime of another data directory (another profile or a test
// home). Health reports `data_dir`; refuse a runtime that serves a different one.
async function probeRuntime(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
  expectedDataDir?: string,
): Promise<RuntimeEndpoint | null> {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const health = asObject(await response.json());
    if (health?.server !== "respire") return null;
    if (health.v !== RUNTIME_PROTOCOL_VERSION) return null;
    if (
      expectedDataDir &&
      typeof health.data_dir === "string" &&
      !(await samePath(health.data_dir, expectedDataDir, process.platform))
    ) {
      return null;
    }
    const version = health.runtime_version ?? health.bin;
    return {
      url,
      runtimeVersion: typeof version === "string" ? version : null,
      pid: typeof health.pid === "number" ? health.pid : null,
      scope: healthScope(health),
    };
  } catch {
    return null;
  }
}

export async function findRuntime(
  dataDir?: string,
): Promise<RuntimeEndpoint | null> {
  const url = await readEndpointUrl(dataDir);
  return url
    ? probeRuntime(url, PROBE_TIMEOUT_MS, resolveDataDir(dataDir))
    : null;
}

function isConnectionRefused(error: unknown) {
  const cause = (error as { cause?: { code?: unknown } })?.cause;
  return cause?.code === "ECONNREFUSED";
}

// rsrs runtime RPC (`POST /api/rpc`, method `cli.exec`) runs the same argv the
// rsrs CLI forwards to it, so every CLI flag is available without spawning a
// process. Newer runtimes require the health identity as `scope` on business
// requests; see respire-cli docs/runtime-control-contract.md.
export async function execRuntimeCli(
  endpoint: RuntimeEndpoint,
  args: readonly string[],
  timeoutMs: number,
): Promise<RsrsReply> {
  const body: Record<string, unknown> = {
    v: RUNTIME_PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    method: "cli.exec",
    args,
    queue_wait_ms: timeoutMs,
  };
  if (endpoint.scope) {
    const operationId = crypto.randomUUID();
    body.scope = endpoint.scope;
    body.operation_id = operationId;
    body.idempotency_key = operationId;
  }
  let response: Response;
  try {
    response = await fetch(`${endpoint.url}/api/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      const timeout = new Error(
        `rsrs ${args[0]} timed out after ${timeoutMs}ms`,
        { cause: error },
      );
      timeout.name = "TimeoutError";
      throw timeout;
    }
    if (isConnectionRefused(error)) {
      throw new RuntimeUnreachableError("rsrs runtime refused the connection", {
        cause: error,
      });
    }
    throw error;
  }
  if (!response.ok) {
    throw new RuntimeUnreachableError(
      `rsrs runtime returned HTTP ${response.status}`,
    );
  }
  const reply = asObject(await response.json());
  const exit = typeof reply?.exit === "number" ? reply.exit : null;
  const envelope = asObject(reply?.envelope);
  if (envelope) return { payload: envelope, exit };
  const code = typeof reply?.code === "string" ? reply.code : null;
  const error =
    typeof reply?.error === "string"
      ? reply.error
      : (code ?? "rsrs runtime call failed");
  return {
    payload: { status: "fail", summary: { reason: code }, errors: [error] },
    exit: exit ?? 1,
  };
}
