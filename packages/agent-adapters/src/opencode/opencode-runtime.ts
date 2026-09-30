import { spawnSync } from "node:child_process";
import {
  agentMinimumVersions,
  getAgentVersionStatus,
  parseAgentVersion,
} from "@cocurdex/shared";
import { OpenCode, type OpenCodeClient } from "@opencode/client";
import { Service } from "@opencode/client/service";

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

  const result = spawnSync("opencode", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
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

export async function connectOpenCode(): Promise<OpenCodeClient> {
  assertSupportedOpenCodeCli();
  const endpoint = await Service.ensure({
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
