import type { DaemonRequest } from "@cocurdex/rpc";
import { DAEMON_METHOD_SCOPES } from "@cocurdex/rpc/method-scopes";
import { type HostPrincipal, principalHasScope } from "@cocurdex/shared";
import type { DaemonShutdownGate } from "./daemon-shutdown-gate";
import { logDaemonDiagnostic } from "./diagnostics";
import { handleDaemonRequest } from "./handler";
import { principalActor } from "./host-access";
import {
  type DaemonObservability,
  handleObservabilityRequest,
  isObservabilityRequest,
} from "./observability-requests";
import type { DaemonReceiptOutcome, DaemonReceiptStore } from "./rpc-receipts";
import { logDaemonRequest, logRejectedDaemonRequest } from "./rpc-request-log";
import type { CocurdexDaemonService } from "./service";

export interface DaemonRequestRuntime {
  service: CocurdexDaemonService;
  gate: DaemonShutdownGate;
  receipts: DaemonReceiptStore;
  observability: DaemonObservability;
  close(): Promise<void>;
}

export interface DaemonRequestConnection {
  remote: boolean;
  remoteAddress: string | null;
  send(message: unknown, onSent?: () => void): void;
  onPrincipal(principal: HostPrincipal): void;
  subscribe(
    afterSeq: number | undefined,
    epoch: string | undefined,
  ): { epoch: string; replayGap: boolean };
}

type AuthorizationResult =
  | { ok: true; principal: HostPrincipal }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN"; message: string };

function normalizeAfterSeq(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function normalizeEpoch(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    ? value
    : undefined;
}

function normalizeIdempotencyKey(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    ? value
    : undefined;
}

function isMutatingMethod(method: unknown) {
  return (
    typeof method === "string" &&
    Object.hasOwn(DAEMON_METHOD_SCOPES, method) &&
    DAEMON_METHOD_SCOPES[method as keyof typeof DAEMON_METHOD_SCOPES] !== "read"
  );
}

export function authorizeDaemonRequest(
  principal: HostPrincipal | null,
  method: unknown,
  remote: boolean,
): AuthorizationResult {
  if (!principal || (remote && principal.kind === "local")) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Invalid daemon token",
    };
  }
  if (principal.kind === "local") return { ok: true, principal };
  const scope =
    typeof method === "string" && Object.hasOwn(DAEMON_METHOD_SCOPES, method)
      ? DAEMON_METHOD_SCOPES[method as keyof typeof DAEMON_METHOD_SCOPES]
      : undefined;
  if (!scope || !principalHasScope(principal, scope)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: scope
        ? `This device is missing the ${scope} scope`
        : "Unknown daemon method",
    };
  }
  return { ok: true, principal };
}

function requestFailedError(error: unknown) {
  return {
    code: "REQUEST_FAILED",
    message: error instanceof Error ? error.message : "Unknown error",
  };
}

export async function handleDaemonWireMessage(
  runtime: DaemonRequestRuntime,
  connection: DaemonRequestConnection,
  message: unknown,
) {
  const { service, gate, receipts } = runtime;
  const request = message as DaemonRequest;
  const authorization = authorizeDaemonRequest(
    service.hostAccess.resolve(request.token),
    request.method,
    connection.remote,
  );
  if (!authorization.ok) {
    logRejectedDaemonRequest({
      method: request.method,
      code: authorization.code,
      remote: connection.remote,
      remoteAddress: connection.remoteAddress,
    });
    connection.send({
      id: request.id,
      error: { code: authorization.code, message: authorization.message },
    });
    return;
  }
  const { principal } = authorization;
  const startedAt = performance.now();
  let replayed = false;
  const send = (response: Record<string, unknown>, onSent?: () => void) => {
    const error = response.error as
      | { code: string; message: string }
      | undefined;
    logDaemonRequest({
      method: request.method,
      requestId: request.id,
      principal,
      remote: connection.remote,
      durationMs: performance.now() - startedAt,
      replayed,
      error,
    });
    connection.send(response, onSent);
  };
  connection.onPrincipal(principal);
  const context = { principal, remoteAddress: connection.remoteAddress };

  try {
    if (request.method === "daemon.shutdownIfIdle") {
      const status = service.status();
      if (
        request.params.pid !== status.pid ||
        request.params.startedAt !== status.startedAt
      ) {
        throw new Error("Daemon identity changed; shutdown was not accepted");
      }
      const result = gate.prepare(service.getActiveWork());
      send(
        { id: request.id, result },
        result.status === "accepted"
          ? () => {
              void runtime.close().catch((error: unknown) =>
                logDaemonDiagnostic("error", "daemon.shutdownFailed", {
                  error,
                }),
              );
            }
          : undefined,
      );
      return;
    }
    let subscribeResult: { epoch: string; replayGap: boolean } | undefined;
    if (request.method === "daemon.subscribe") {
      subscribeResult = connection.subscribe(
        normalizeAfterSeq(request.params?.afterSeq),
        normalizeEpoch(request.params?.epoch),
      );
    }
    const dispatch = () => {
      if (request.method === "daemon.subscribe") {
        return Promise.resolve(subscribeResult);
      }
      if (request.method === "daemon.status") {
        return handleDaemonRequest(service, request, context);
      }
      if (request.method === "daemon.health") {
        return handleObservabilityRequest(
          runtime.observability,
          request,
          principal,
        );
      }
      if (isObservabilityRequest(request.method)) {
        return gate.run(() =>
          handleObservabilityRequest(runtime.observability, request, principal),
        );
      }
      return gate.run(() => handleDaemonRequest(service, request, context));
    };
    const run = async (): Promise<DaemonReceiptOutcome> => {
      try {
        return { ok: true, result: await dispatch() };
      } catch (error) {
        return { ok: false, error: requestFailedError(error) };
      }
    };
    const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey);
    const execution = idempotencyKey
      ? await receipts.execute(
          `${principalActor(principal)}:${request.method}:${idempotencyKey}`,
          run,
          { durable: isMutatingMethod(request.method) },
        )
      : { outcome: await run(), replayed: false };
    replayed = execution.replayed;
    if (execution.outcome.ok) {
      send(
        { id: request.id, result: execution.outcome.result },
        request.method === "host.devices.revokeSelf" &&
          principal.kind === "device"
          ? () => service.hostAccess.disconnectDevice(principal.deviceId)
          : undefined,
      );
    } else {
      send({ id: request.id, error: execution.outcome.error });
    }
  } catch (error) {
    send({ id: request.id, error: requestFailedError(error) });
  }
}
