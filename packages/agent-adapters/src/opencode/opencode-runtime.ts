import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { createOpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient as OpenCodeV2Client } from "@opencode-ai/sdk/v2";
import { createOpencodeClient as createOpenCodeV2Client } from "@opencode-ai/sdk/v2";
import {
  getOpenCodeDiagnosticEnvironment,
  type OpenCodeServer,
  startOpenCodeServer,
} from "./opencode-server";

export const MIN_SUPPORTED_OPENCODE_VERSION = "1.14.29";

const OPEN_CODE_DATABASE_SCHEMA_ERROR =
  /sqliteerror:\s*no such column:\s*([a-z0-9_]+)/i;

export interface OpenCodeRuntime {
  client: OpencodeClient;
  clientV2: OpenCodeV2Client;
  server: OpenCodeServer;
  serverVersion: string | null;
  refCount: number;
  cacheKey: string;
}

export class OpenCodeRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenCodeRequestError";
  }
}

export class OpenCodeCompatibilityError extends Error {
  constructor(
    message: string,
    readonly serverVersion?: string,
  ) {
    super(message);
    this.name = "OpenCodeCompatibilityError";
  }
}

export function isOpenCodeNotFound(error: unknown) {
  return error instanceof OpenCodeRequestError && error.status === 404;
}

const sharedRuntimePromises = new Map<string, Promise<OpenCodeRuntime>>();
const OPEN_CODE_MANAGED_SERVER_WORKSPACE_PATH = path.join(
  tmpdir(),
  "cocurdex-opencode-managed",
);

export async function getOpenCodeManagedServerWorkspacePath(): Promise<string> {
  await mkdir(OPEN_CODE_MANAGED_SERVER_WORKSPACE_PATH, { recursive: true });
  return OPEN_CODE_MANAGED_SERVER_WORKSPACE_PATH;
}

function isOpenCodeDebugEnabled() {
  return process.env.COCURDEX_OPENCODE_DEBUG === "1";
}

export function logOpenCode(
  level: "debug" | "error" | "info" | "warn",
  message: string,
  details?: Record<string, unknown>,
) {
  if (level === "debug" && !isOpenCodeDebugEnabled()) {
    return;
  }

  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console[level](`[OpenCodeAdapter] ${message}${suffix}`);
}

export function formatOpenCodeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    if ("data" in error) {
      return formatOpenCodeError(error.data);
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }

    try {
      return JSON.stringify(error);
    } catch (serializationError) {
      logOpenCode("debug", "Failed to serialize OpenCode error", {
        error: String(serializationError),
      });
    }
  }

  return "Unknown OpenCode error";
}

function parseOpenCodeVersion(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function compareOpenCodeVersions(left: string, right: string) {
  const leftParts = parseOpenCodeVersion(left);
  const rightParts = parseOpenCodeVersion(right);
  if (!leftParts || !rightParts) return null;

  for (const index of [0, 1, 2]) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }

  return 0;
}

export function isOpenCodeVersionSupported(version: string) {
  return (
    compareOpenCodeVersions(version, MIN_SUPPORTED_OPENCODE_VERSION) === 1 ||
    compareOpenCodeVersions(version, MIN_SUPPORTED_OPENCODE_VERSION) === 0
  );
}

export function isOpenCodeDatabaseSchemaMismatch(error: unknown) {
  return OPEN_CODE_DATABASE_SCHEMA_ERROR.test(formatOpenCodeError(error));
}

export function getOpenCodeDatabaseSchemaMismatchColumn(error: unknown) {
  return (
    formatOpenCodeError(error).match(OPEN_CODE_DATABASE_SCHEMA_ERROR)?.[1] ??
    null
  );
}

function formatOpenCodeDatabaseSchemaError(error: unknown) {
  const message = formatOpenCodeError(error);
  const missingColumn = getOpenCodeDatabaseSchemaMismatchColumn(message);
  const detail = missingColumn ? ` (missing ${missingColumn})` : "";

  return `OpenCode's local database schema is incompatible with this OpenCode server${detail}. Upgrade OpenCode, quit other OpenCode processes, and retry. Back up the OpenCode database before repairing it; Cocurdex does not migrate or delete OpenCode's database.`;
}

export function formatOpenCodeUserFacingError(error: unknown) {
  return isOpenCodeDatabaseSchemaMismatch(error)
    ? formatOpenCodeDatabaseSchemaError(error)
    : formatOpenCodeError(error);
}

async function readOpenCodeServerVersion(
  client: OpenCodeV2Client,
): Promise<string | null> {
  try {
    const result = await client.global.health();
    if (result.error || !result.data?.version) {
      logOpenCode("warn", "OpenCode server health check returned no version", {
        error: result.error ? formatOpenCodeError(result.error) : undefined,
      });
      return null;
    }

    return result.data.version;
  } catch (error) {
    logOpenCode("warn", "OpenCode server health check was unavailable", {
      error: formatOpenCodeError(error),
    });
    return null;
  }
}

function assertSupportedOpenCodeVersion(serverVersion: string | null) {
  if (!serverVersion || !parseOpenCodeVersion(serverVersion)) {
    return;
  }

  if (isOpenCodeVersionSupported(serverVersion)) {
    return;
  }

  throw new OpenCodeCompatibilityError(
    `OpenCode ${serverVersion} is too old for Cocurdex. Upgrade OpenCode to ${MIN_SUPPORTED_OPENCODE_VERSION} or newer and retry.`,
    serverVersion,
  );
}

async function createSharedOpenCodeRuntime(
  cacheKey: string,
): Promise<OpenCodeRuntime> {
  let server: OpenCodeServer | null = null;

  try {
    const serverWorkspaceRootPath =
      await getOpenCodeManagedServerWorkspacePath();
    logOpenCode("info", "Starting managed OpenCode server", {
      hostProcess: {
        arch: process.arch,
        cwd: process.cwd(),
        execPath: process.execPath,
        pid: process.pid,
        platform: process.platform,
      },
      pathEntries: (process.env.PATH ?? "").split(":").length,
      workspaceRootPath: serverWorkspaceRootPath,
    });
    server = await startOpenCodeServer({
      workspaceRootPath: serverWorkspaceRootPath,
      hostname: "127.0.0.1",
      onLaunch(launch) {
        const environment = getOpenCodeDiagnosticEnvironment(launch.env);
        logOpenCode("info", "OpenCode executable resolved", {
          executable: launch.executable,
        });
        logOpenCode("info", "OpenCode process launch", {
          args: launch.args,
          cwd: launch.cwd,
        });
        logOpenCode("info", "OpenCode database environment", {
          OPENCODE_CHANNEL: environment.OPENCODE_CHANNEL,
          OPENCODE_CLIENT: environment.OPENCODE_CLIENT,
          OPENCODE_CONFIG: environment.OPENCODE_CONFIG,
          OPENCODE_CONFIG_CONTENT: environment.OPENCODE_CONFIG_CONTENT,
          OPENCODE_CONFIG_DIR: environment.OPENCODE_CONFIG_DIR,
          OPENCODE_DB: environment.OPENCODE_DB,
          XDG_DATA_HOME: environment.XDG_DATA_HOME,
          XDG_STATE_HOME: environment.XDG_STATE_HOME,
        });
        logOpenCode("info", "OpenCode process environment", {
          HOME: environment.HOME,
          PATH: environment.PATH,
          PWD: environment.PWD,
        });
      },
      onOutput(stream, output) {
        logOpenCode("info", "OpenCode server output", {
          output: output.trimEnd(),
          stream,
        });
      },
    });
    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: serverWorkspaceRootPath,
    });
    const clientV2 = createOpenCodeV2Client({
      baseUrl: server.url,
      directory: serverWorkspaceRootPath,
    });
    const serverVersion = await readOpenCodeServerVersion(clientV2);
    assertSupportedOpenCodeVersion(serverVersion);
    logOpenCode("info", "Managed OpenCode server ready", {
      executable: server.executable,
      pid: server.pid,
      url: server.url,
      serverVersion,
      workspaceRootPath: serverWorkspaceRootPath,
    });
    return {
      client,
      clientV2,
      server,
      serverVersion,
      refCount: 0,
      cacheKey,
    };
  } catch (error) {
    server?.close();
    logOpenCode("error", "Failed to start managed OpenCode server", {
      error: formatOpenCodeError(error),
    });
    throw error;
  }
}

export async function acquireOpenCodeRuntime(): Promise<OpenCodeRuntime> {
  const cacheKey = "managed-opencode";
  sharedRuntimePromises.set(
    cacheKey,
    sharedRuntimePromises.get(cacheKey) ??
      createSharedOpenCodeRuntime(cacheKey).catch((error) => {
        sharedRuntimePromises.delete(cacheKey);
        throw error;
      }),
  );
  const sharedRuntimePromise = sharedRuntimePromises.get(cacheKey);

  if (!sharedRuntimePromise) {
    throw new Error("OpenCode runtime failed to initialize");
  }

  const runtime = await sharedRuntimePromise;
  runtime.refCount += 1;
  logOpenCode("debug", "Runtime acquired", {
    refCount: runtime.refCount,
    url: runtime.server.url,
  });
  return runtime;
}

export function releaseOpenCodeRuntime(runtime: OpenCodeRuntime | null) {
  if (!runtime) return;

  runtime.refCount -= 1;
  logOpenCode("debug", "Runtime released", {
    refCount: runtime.refCount,
  });
  if (runtime.refCount > 0) return;

  runtime.server.close();
  sharedRuntimePromises.delete(runtime.cacheKey);
}

export async function expectOpenCodeData<T>(
  request: Promise<{ data?: T; error?: unknown; response?: Response }>,
  action: string,
): Promise<T> {
  const result = await request;
  if (result.error) {
    if (isOpenCodeDatabaseSchemaMismatch(result.error)) {
      logOpenCode("error", "OpenCode database schema mismatch", {
        action,
        missingColumn: getOpenCodeDatabaseSchemaMismatchColumn(result.error),
        status: result.response?.status ?? null,
      });
      throw new OpenCodeRequestError(
        formatOpenCodeUserFacingError(result.error),
        result.response?.status,
      );
    }

    throw new OpenCodeRequestError(
      `OpenCode ${action} failed: ${formatOpenCodeError(result.error)}`,
      result.response?.status,
    );
  }

  if (result.data === undefined || result.data === null) {
    const status = result.response ? ` (${result.response.status})` : "";
    throw new OpenCodeRequestError(
      `OpenCode ${action} returned no data${status}`,
      result.response?.status,
    );
  }

  return result.data;
}

export async function expectOpenCodeSuccess(
  request: Promise<{ error?: unknown; response?: Response }>,
  action: string,
): Promise<void> {
  const result = await request;
  if (result.error) {
    if (isOpenCodeDatabaseSchemaMismatch(result.error)) {
      logOpenCode("error", "OpenCode database schema mismatch", {
        action,
        missingColumn: getOpenCodeDatabaseSchemaMismatchColumn(result.error),
        status: result.response?.status ?? null,
      });
      throw new OpenCodeRequestError(
        formatOpenCodeUserFacingError(result.error),
        result.response?.status,
      );
    }

    throw new OpenCodeRequestError(
      `OpenCode ${action} failed: ${formatOpenCodeError(result.error)}`,
      result.response?.status,
    );
  }
}
