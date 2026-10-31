import { createReadStream } from "node:fs";
import type http from "node:http";
import { pipeline } from "node:stream";
import {
  type AttachmentUploadKind,
  DAEMON_ATTACHMENT_FILE_QUERY,
  DAEMON_ATTACHMENT_HTTP_PATH,
  DAEMON_ATTACHMENT_NAME_QUERY,
  type HostAccessScope,
  type HostPrincipal,
  principalHasScope,
} from "@cocurdex/shared";
import {
  AttachmentImportError,
  type AttachmentImportFailure,
  type DaemonAttachmentStore,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from "./attachment-store";
import { readBearerToken } from "./host-access";
import { corsHeaders, endWith, readRequestUrl } from "./pdf-http";

export interface AttachmentHttpHandlerOptions {
  isAllowedRequest(request: http.IncomingMessage): boolean;
  resolvePrincipal(token: string | null): HostPrincipal | null;
  store: Pick<
    DaemonAttachmentStore,
    "importImage" | "importDocument" | "locateImage"
  >;
}

const UPLOAD_LIMITS: Record<AttachmentUploadKind, number> = {
  image: MAX_IMAGE_ATTACHMENT_BYTES,
  document: MAX_DOCUMENT_ATTACHMENT_BYTES,
};

const FAILURE_STATUS: Record<AttachmentImportFailure, number> = {
  "too-large": 413,
  unsupported: 415,
  invalid: 400,
};

export function isAttachmentHttpRequest(request: http.IncomingMessage) {
  return (
    readRequestUrl(request)?.pathname.startsWith(
      `${DAEMON_ATTACHMENT_HTTP_PATH}/`,
    ) ?? false
  );
}

function uploadKind(pathname: string): AttachmentUploadKind | null {
  const kind = pathname.slice(DAEMON_ATTACHMENT_HTTP_PATH.length + 1);
  return kind === "image" || kind === "document" ? kind : null;
}

function attachmentPreflightHeaders(request: http.IncomingMessage) {
  const privateNetwork =
    request.headers["access-control-request-private-network"] === "true";
  return {
    ...corsHeaders(request),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, HEAD, POST",
    "Access-Control-Max-Age": "600",
    ...(privateNetwork
      ? { "Access-Control-Allow-Private-Network": "true" }
      : {}),
  };
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  headers: http.OutgoingHttpHeaders,
  body: unknown,
) {
  response.writeHead(status, {
    ...headers,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

const MAX_DRAINED_BYTES = Math.max(...Object.values(UPLOAD_LIMITS));

function declaredLength(request: http.IncomingMessage) {
  const header = request.headers["content-length"];
  if (header === undefined) return null;
  const length = Number(header);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
}

function refuseUpload(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  send: () => void,
) {
  const length = declaredLength(request);
  if (
    request.readableEnded ||
    (length !== null && length <= MAX_DRAINED_BYTES)
  ) {
    request.resume();
    send();
    return;
  }
  response.setHeader("Connection", "close");
  send();
  response.once("finish", () => request.destroy());
}

export function createAttachmentHttpHandler(
  options: AttachmentHttpHandlerOptions,
) {
  const authorizationStatus = (
    request: http.IncomingMessage,
    scope: HostAccessScope,
  ) => {
    const principal = options.resolvePrincipal(
      readBearerToken(request.headers.authorization),
    );
    if (!principal) return 401;
    return principalHasScope(principal, scope) ? null : 403;
  };

  const upload = async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    kind: AttachmentUploadKind,
    url: URL,
  ) => {
    const cors = corsHeaders(request);
    const refusal = authorizationStatus(request, "interact");
    if (refusal !== null) {
      refuseUpload(request, response, () => endWith(response, refusal, cors));
      return;
    }
    const length = declaredLength(request);
    if (length !== null && length > UPLOAD_LIMITS[kind]) {
      refuseUpload(request, response, () =>
        sendJson(response, 413, cors, {
          error:
            kind === "image"
              ? "Image attachment is too large"
              : "Document attachment is too large",
        }),
      );
      return;
    }
    const name = url.searchParams.get(DAEMON_ATTACHMENT_NAME_QUERY) ?? "";
    try {
      const attachment =
        kind === "image"
          ? await options.store.importImage(request, name)
          : await options.store.importDocument(request, name);
      sendJson(response, 201, cors, attachment);
    } catch (error) {
      if (!(error instanceof AttachmentImportError)) throw error;
      refuseUpload(request, response, () =>
        sendJson(response, FAILURE_STATUS[error.reason], cors, {
          error: error.message,
        }),
      );
    }
  };

  const readImage = async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    url: URL,
  ) => {
    const cors = corsHeaders(request);
    const refusal = authorizationStatus(request, "read");
    if (refusal !== null) {
      endWith(response, refusal, cors);
      return;
    }
    const fileName = url.searchParams.get(DAEMON_ATTACHMENT_FILE_QUERY) ?? "";
    const image = await options.store.locateImage(fileName);
    if (!image) {
      endWith(response, 404, cors);
      return;
    }
    response.writeHead(200, {
      ...cors,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": image.size,
      "Content-Type": image.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    pipeline(createReadStream(image.path), response, () => {});
  };

  return async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => {
    if (!options.isAllowedRequest(request)) {
      endWith(response, 403, {});
      return;
    }
    const url = readRequestUrl(request);
    const kind = url ? uploadKind(url.pathname) : null;
    if (!url || !kind) {
      endWith(response, 404, corsHeaders(request));
      return;
    }
    if (request.method === "OPTIONS") {
      endWith(response, 204, attachmentPreflightHeaders(request));
      return;
    }
    if (request.method === "POST") {
      await upload(request, response, kind, url);
      return;
    }
    if (
      kind === "image" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      await readImage(request, response, url);
      return;
    }
    endWith(response, 405, {
      ...corsHeaders(request),
      Allow: kind === "image" ? "GET, HEAD, POST" : "POST",
    });
  };
}
