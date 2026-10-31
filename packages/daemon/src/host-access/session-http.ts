import type http from "node:http";
import type { HostAccessService } from "./host-access-service";
import { sendJson } from "./http-json";
import type { FixedWindowRateLimiter } from "./rate-limiter";

export function readBearerToken(header: string | undefined) {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match?.[1] ?? null;
}

export function createSessionHttpHandler(options: {
  hostAccess: HostAccessService;
  limiter: FixedWindowRateLimiter;
  now?(): number;
}) {
  return (request: http.IncomingMessage, response: http.ServerResponse) => {
    if (request.method !== "GET") {
      response.writeHead(405, { allow: "GET" });
      response.end();
      return;
    }
    const remoteAddress = request.socket.remoteAddress ?? "unknown";
    if (!options.limiter.take(remoteAddress, options.now?.() ?? Date.now())) {
      sendJson(response, 429, { error: "Too many requests" });
      return;
    }
    const principal = options.hostAccess.resolve(
      readBearerToken(request.headers.authorization),
    );
    if (principal?.kind !== "device") {
      sendJson(response, 401, { error: "Device is not paired" });
      return;
    }
    sendJson(response, 200, {
      host: options.hostAccess.identity(),
      principal,
    });
  };
}
