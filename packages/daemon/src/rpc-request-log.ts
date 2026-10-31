import { isLongRunningDaemonMethod } from "@cocurdex/rpc/client";
import {
  errorKindForLog,
  type HostPrincipal,
  type LogLevel,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "./diagnostics";

export const SLOW_REQUEST_THRESHOLD_MS = 1_000;

export interface DaemonRequestLogEntry {
  method: unknown;
  requestId: unknown;
  principal: HostPrincipal;
  remote: boolean;
  durationMs: number;
  replayed: boolean;
  error?: { code: string; message: string };
}

export function classifyDaemonRequest(entry: {
  method: string;
  durationMs: number;
  failed: boolean;
}): { level: LogLevel; event: string } {
  if (entry.failed) {
    return { level: "warn", event: "rpc.failed" };
  }
  if (
    entry.durationMs >= SLOW_REQUEST_THRESHOLD_MS &&
    entry.method !== "daemon.subscribe" &&
    !isLongRunningDaemonMethod(entry.method)
  ) {
    return { level: "warn", event: "rpc.slow" };
  }
  return { level: "debug", event: "rpc.completed" };
}

function methodName(method: unknown) {
  return typeof method === "string" ? method.slice(0, 120) : "[invalid]";
}

export function logDaemonRequest(entry: DaemonRequestLogEntry) {
  const method = methodName(entry.method);
  const durationMs = Math.round(entry.durationMs);
  const { level, event } = classifyDaemonRequest({
    method,
    durationMs,
    failed: entry.error !== undefined,
  });
  logDaemonDiagnostic(level, event, {
    durationMs,
    method,
    principal: entry.principal.kind,
    remote: entry.remote,
    replayed: entry.replayed,
    requestId: typeof entry.requestId === "string" ? entry.requestId : null,
    ...(entry.error
      ? {
          errorCode: entry.error.code,
          errorKind: errorKindForLog(entry.error.message),
          errorMessage: entry.error.message,
        }
      : {}),
  });
}

export function logRejectedDaemonRequest(entry: {
  method: unknown;
  code: string;
  remote: boolean;
  remoteAddress: string | null;
}) {
  logDaemonDiagnostic("warn", "rpc.rejected", {
    code: entry.code,
    method: methodName(entry.method),
    remote: entry.remote,
    remoteAddress: entry.remoteAddress,
  });
}
