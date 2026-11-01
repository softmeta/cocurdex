import { createHash, type KeyObject, sign } from "node:crypto";
import type { PushRegistration } from "@cocurdex/shared";

const SIGNATURE_LABEL = "cocurdex-push/1";
const REQUEST_TIMEOUT_MS = 10_000;

export type PushSendOutcome = "sent" | "unregistered" | "failed";

export interface PushSendRequest {
  handle: string;
  ciphertext: string;
  collapseId: string;
  priority: "high" | "normal";
  expiresAt: number;
}

export interface PushGatewayClientOptions {
  url: string;
  signingKey: KeyObject;
  fetch?: typeof fetch;
  now?(): Date;
}

export class PushGatewayError extends Error {
  override name = "PushGatewayError";

  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`The push gateway answered ${status}${code ? ` (${code})` : ""}`);
  }
}

export function pushSignaturePayload(
  method: string,
  path: string,
  timestamp: number,
  body: string,
) {
  const digest = createHash("sha256").update(body, "utf8").digest();
  return Buffer.concat([
    Buffer.from(
      `${SIGNATURE_LABEL}\0${method}\0${path}\0${timestamp}\0`,
      "utf8",
    ),
    digest,
  ]);
}

function publicKeyBase64Url(key: KeyObject) {
  const jwk = key.export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("Host key is not Ed25519");
  return jwk.x;
}

async function readErrorCode(response: Response) {
  try {
    const parsed = (await response.json()) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

export function createPushGatewayClient(options: PushGatewayClientOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const publicKey = publicKeyBase64Url(options.signingKey);

  const post = async (endpoint: string, payload: unknown) => {
    const url = new URL(`${options.url}${endpoint}`);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(
      (options.now?.() ?? new Date()).getTime() / 1000,
    );
    const signature = sign(
      null,
      pushSignaturePayload("POST", url.pathname, timestamp, body),
      options.signingKey,
    ).toString("base64url");
    return fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Cocurdex-Push key=${publicKey}, ts=${timestamp}, sig=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  return {
    async issueHandle(registration: PushRegistration): Promise<string> {
      const response = await post("/v1/handles", registration);
      if (!response.ok) {
        throw new PushGatewayError(
          response.status,
          await readErrorCode(response),
        );
      }
      const issued = (await response.json()) as { handle?: unknown };
      if (typeof issued.handle !== "string" || issued.handle.length === 0) {
        throw new PushGatewayError(response.status, "invalidResponse");
      }
      return issued.handle;
    },
    async send(request: PushSendRequest): Promise<PushSendOutcome> {
      try {
        const response = await post("/v1/push", request);
        if (response.ok) return "sent";
        const code = await readErrorCode(response);
        return response.status === 410 && code === "unregistered"
          ? "unregistered"
          : "failed";
      } catch {
        return "failed";
      }
    },
  };
}

export type PushGatewayClient = ReturnType<typeof createPushGatewayClient>;
