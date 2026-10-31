import type http from "node:http";
import type { HostAccessService } from "./host-access-service";
import { sendJson } from "./http-json";
import type { FixedWindowRateLimiter } from "./rate-limiter";

const MAX_BODY_BYTES = 4_096;

function readBody(request: http.IncomingMessage) {
  return new Promise<string | null>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function parseExchangeRequest(body: string) {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; label?: unknown };
    if (typeof parsed.code !== "string" || parsed.code.length > 128) {
      return null;
    }
    return {
      code: parsed.code,
      label: typeof parsed.label === "string" ? parsed.label : undefined,
    };
  } catch {
    return null;
  }
}

export function createPairingHttpHandler(options: {
  hostAccess: HostAccessService;
  limiter: FixedWindowRateLimiter;
  now?(): number;
}) {
  return async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      response.end();
      return;
    }
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, { error: "Expected application/json" });
      return;
    }
    const remoteAddress = request.socket.remoteAddress ?? null;
    const now = options.now?.() ?? Date.now();
    if (!options.limiter.take(remoteAddress ?? "unknown", now)) {
      sendJson(response, 429, { error: "Too many pairing attempts" });
      return;
    }
    const body = await readBody(request);
    const exchange = body === null ? null : parseExchangeRequest(body);
    if (!exchange) {
      sendJson(response, 400, { error: "Invalid pairing request" });
      return;
    }
    const outcome = options.hostAccess.exchangePairing(exchange, remoteAddress);
    if (!outcome.ok) {
      sendJson(response, 401, {
        error: "Pairing code is invalid, expired, or already used",
      });
      return;
    }
    sendJson(response, 200, outcome.result);
  };
}
