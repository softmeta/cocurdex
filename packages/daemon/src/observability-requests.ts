import type { DaemonRequest, DaemonStatus } from "@cocurdex/rpc";
import type { HostPrincipal } from "@cocurdex/shared";
import type { DaemonHealthMonitor } from "./daemon-health";
import type { DaemonLogging } from "./daemon-logging";
import { logDaemonDiagnostic } from "./diagnostics";
import { exportDaemonDiagnostics } from "./diagnostics-export";
import { parseDaemonRequest } from "./payloads";

export interface DaemonObservability {
  status(): DaemonStatus;
  health: DaemonHealthMonitor;
  logging: DaemonLogging | null;
  userDataPath: string;
}

const OBSERVABILITY_METHODS = new Set<string>([
  "daemon.health",
  "diagnostics.export",
  "diagnostics.logLevel.set",
]);

export function isObservabilityRequest(method: unknown) {
  return typeof method === "string" && OBSERVABILITY_METHODS.has(method);
}

export async function handleObservabilityRequest(
  observability: DaemonObservability,
  rawRequest: DaemonRequest,
  principal: HostPrincipal,
): Promise<unknown> {
  const request = parseDaemonRequest(rawRequest);
  const includePaths = principal.kind === "local";
  switch (request.method) {
    case "daemon.health":
      return observability.health.snapshot({ includePaths });
    case "diagnostics.export": {
      if (!includePaths && request.params.hostLogDirectories?.length) {
        throw new Error("Only the local host can attach host log directories");
      }
      if (!observability.logging) {
        throw new Error("Daemon logging is not configured");
      }
      return exportDaemonDiagnostics({
        userDataPath: observability.userDataPath,
        daemonLogDirectory: observability.logging.directory,
        status: observability.status(),
        health: await observability.health.snapshot({ includePaths: false }),
        input: request.params,
      });
    }
    case "diagnostics.logLevel.set": {
      if (!observability.logging) {
        throw new Error("Daemon logging is not configured");
      }
      observability.logging.setLevel(request.params.level);
      logDaemonDiagnostic("info", "diagnostics.logLevelChanged", {
        level: request.params.level,
      });
      return { level: request.params.level };
    }
    default:
      throw new Error(`${request.method} is not an observability request`);
  }
}
