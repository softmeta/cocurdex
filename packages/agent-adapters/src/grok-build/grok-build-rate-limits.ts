import { homedir } from "node:os";
import type { AgentRateLimitsRecord } from "@cocurdex/shared";
import type { AcpConnectionFactory } from "../acp/acp-connection";
import { createSdkAcpConnection } from "../acp/sdk-acp-connection";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  createRateLimitsRecord,
  createRateLimitWindow,
} from "../shared/rate-limits";
import {
  GROK_BUILD_ARGS,
  GROK_BUILD_COMMAND,
  GROK_BUILD_INITIALIZE_META,
  getGrokBuildAuthMethodPriority,
} from "./grok-build-process";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGrokBuildRateLimits(
  value: unknown,
): AgentRateLimitsRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const response = isRecord(value.result) ? value.result : value;
  const config = isRecord(response.config) ? response.config : null;
  const period =
    config && isRecord(config.currentPeriod) ? config.currentPeriod : null;
  const periodType =
    period && typeof period.type === "string" ? period.type.toUpperCase() : "";
  const kind = periodType.includes("WEEKLY") ? "weekly" : "monthly";

  return createRateLimitsRecord([
    createRateLimitWindow({
      kind,
      resetsAt:
        period && typeof period.end === "string"
          ? period.end
          : typeof config?.billingPeriodEnd === "string"
            ? config.billingPeriodEnd
            : null,
      usedPercent: config?.creditUsagePercent,
    }),
  ]);
}

const PROBE_TIMEOUT_MS = 20_000;
export const GROK_BUILD_BILLING_METHOD = "x.ai/billing";

function selectGrokAuthMethod(available: string[]) {
  for (const method of getGrokBuildAuthMethodPriority()) {
    if (available.includes(method)) {
      return method;
    }
  }
  return available[0];
}

async function probeGrokBuildRateLimits(
  connectionFactory: AcpConnectionFactory,
): Promise<AgentRateLimitsRecord | null> {
  const connection = await connectionFactory({
    args: GROK_BUILD_ARGS,
    command: GROK_BUILD_COMMAND,
    cwd: homedir(),
    handlers: {
      onSessionUpdate() {},
      requestPermission() {
        return Promise.resolve({ outcome: { outcome: "cancelled" as const } });
      },
    },
  });

  try {
    const response = await connection.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "Cocurdex", title: "Cocurdex", version: "0.0.0" },
      _meta: GROK_BUILD_INITIALIZE_META,
    });
    const authMethod = selectGrokAuthMethod(
      response.authMethods?.map((method) => method.id) ?? [],
    );
    if (authMethod) {
      await connection.authenticate({ methodId: authMethod });
    }
    return parseGrokBuildRateLimits(
      await connection.extRequest(GROK_BUILD_BILLING_METHOD, {}),
    );
  } finally {
    await connection.close();
  }
}

export async function readGrokBuildRateLimits(
  connectionFactory: AcpConnectionFactory = createSdkAcpConnection,
): Promise<AgentRateLimitsRecord | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      probeGrokBuildRateLimits(connectionFactory),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    logAdapterDiagnostic("debug", "[GrokBuild] rate limits unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
