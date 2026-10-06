import {
  agentMinimumVersions,
  getAgentVersionStatus,
  parseAgentVersion,
} from "@cocurdex/shared";
import { OpenCode, type OpenCodeClient } from "@opencode/client";
import { Service } from "@opencode/client/service";
import crossSpawn from "cross-spawn";

export type { OpenCodeClient };

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
    return error.message || error.name;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown OpenCode error";
    }
  }

  return "Unknown OpenCode error";
}

export function isOpenCodeSessionNotFound(error: unknown) {
  return error instanceof Error && error.name === "SessionNotFoundError";
}

let verifiedCliVersion: string | null = null;

function assertSupportedOpenCodeCli() {
  if (verifiedCliVersion) return;

  const result = crossSpawn.sync("opencode", ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(
      `OpenCode CLI was not found on PATH: ${result.error.message}`,
    );
  }

  const version = parseAgentVersion(String(result.stdout ?? ""));
  if (getAgentVersionStatus("opencode", version) === "outdated") {
    throw new Error(
      `OpenCode ${version} is too old for Cocurdex. Upgrade OpenCode to ${agentMinimumVersions.opencode} or newer and retry.`,
    );
  }

  verifiedCliVersion = version ?? "unknown";
}

function openCodeServiceCommand(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  const serviceArgs = ["opencode", "serve", "--service"];
  if (platform !== "win32") {
    return serviceArgs;
  }
  return [env.ComSpec || "cmd.exe", "/d", "/s", "/c", ...serviceArgs];
}

export async function connectOpenCode(): Promise<OpenCodeClient> {
  assertSupportedOpenCodeCli();
  const endpoint = await Service.ensure({
    command: openCodeServiceCommand(process.platform, process.env),
    onStart(reason, previousVersion) {
      logOpenCode("info", "Starting OpenCode background service", {
        previousVersion: previousVersion ?? null,
        reason,
      });
    },
  });
  return OpenCode.make({
    baseUrl: endpoint.url,
    headers: Service.headers(endpoint),
  });
}
