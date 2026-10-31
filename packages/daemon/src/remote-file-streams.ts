import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { type MuxStream, writeStreamHead } from "@cocurdex/secure-channel";
import {
  type HostAccessScope,
  type HostPrincipal,
  principalHasScope,
  type RemoteByteRange,
  type RemoteFileFailure,
  type RemoteFileHead,
  type RemoteFileRequest,
  workspaceFileContentType,
} from "@cocurdex/shared";
import {
  AttachmentImportError,
  type AttachmentImportFailure,
  type DaemonAttachmentStore,
} from "./attachment-store";

const READ_CHUNK_BYTES = 64 * 1024;
const MAX_REQUEST_HEADER_BYTES = 4096;

export interface RemoteFileStreamOptions {
  principal(): HostPrincipal | null;
  resolveWorkspaceFilePath(filePath: string): Promise<string>;
  resolvePdfPath(filePath: string): Promise<string>;
  attachments: Pick<
    DaemonAttachmentStore,
    "importImage" | "importDocument" | "locateImage"
  >;
}

const IMPORT_FAILURES: Record<AttachmentImportFailure, RemoteFileFailure> = {
  "too-large": "tooLarge",
  unsupported: "unsupported",
  invalid: "invalid",
};

const REQUIRED_SCOPE: Record<RemoteFileRequest["kind"], HostAccessScope> = {
  workspaceFile: "files.read",
  pdf: "files.read",
  imageAttachment: "read",
  attachmentUpload: "interact",
};

function isRange(value: unknown): value is RemoteByteRange {
  const range = value as RemoteByteRange | null;
  return (
    typeof range === "object" &&
    range !== null &&
    Number.isSafeInteger(range.start) &&
    range.start >= 0 &&
    (range.end === undefined ||
      (Number.isSafeInteger(range.end) && range.end >= range.start))
  );
}

function parseRequest(header: Uint8Array): RemoteFileRequest | null {
  if (header.length > MAX_REQUEST_HEADER_BYTES) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(new TextDecoder().decode(header)) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  const rangeValid = value.range === undefined || isRange(value.range);
  switch (value.kind) {
    case "workspaceFile":
    case "pdf":
      return typeof value.path === "string" && value.path && rangeValid
        ? (value as RemoteFileRequest)
        : null;
    case "imageAttachment":
      return typeof value.file === "string" && value.file
        ? (value as RemoteFileRequest)
        : null;
    case "attachmentUpload":
      return (value.upload === "image" || value.upload === "document") &&
        typeof value.name === "string"
        ? (value as RemoteFileRequest)
        : null;
    default:
      return null;
  }
}

async function fail(
  stream: MuxStream,
  error: RemoteFileFailure,
  message?: string,
) {
  const head: RemoteFileHead = { ok: false, error, message };
  await writeStreamHead(stream, head);
  await stream.end();
}

async function sendFile(
  stream: MuxStream,
  filePath: string,
  contentType: string,
  range: RemoteByteRange | undefined,
) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    await fail(stream, "notFound");
    return;
  }
  const start = range?.start ?? 0;
  const end = Math.min(range?.end ?? info.size - 1, info.size - 1);
  if (info.size > 0 && start >= info.size) {
    await fail(stream, "unsatisfiable");
    return;
  }
  const head: RemoteFileHead = {
    ok: true,
    size: info.size,
    start,
    end,
    contentType,
  };
  await writeStreamHead(stream, head);
  if (end >= start) {
    const file = createReadStream(filePath, {
      start,
      end,
      highWaterMark: READ_CHUNK_BYTES,
    });
    for await (const chunk of file) {
      await stream.write(chunk as Buffer);
    }
  }
  await stream.end();
}

async function receiveUpload(
  stream: MuxStream,
  request: Extract<RemoteFileRequest, { kind: "attachmentUpload" }>,
  attachments: RemoteFileStreamOptions["attachments"],
) {
  try {
    const uploaded =
      request.upload === "image"
        ? await attachments.importImage(stream.chunks, request.name)
        : await attachments.importDocument(stream.chunks, request.name);
    const head: RemoteFileHead = { ok: true, uploaded };
    await writeStreamHead(stream, head);
    await stream.end();
  } catch (error) {
    if (!(error instanceof AttachmentImportError)) throw error;
    await fail(stream, IMPORT_FAILURES[error.reason], error.message);
  }
}

async function serve(
  stream: MuxStream,
  request: RemoteFileRequest,
  options: RemoteFileStreamOptions,
) {
  switch (request.kind) {
    case "workspaceFile": {
      const filePath = await options
        .resolveWorkspaceFilePath(request.path)
        .catch(() => null);
      if (!filePath) return fail(stream, "forbidden");
      return sendFile(
        stream,
        filePath,
        workspaceFileContentType(filePath),
        request.range,
      );
    }
    case "pdf": {
      const filePath = await options
        .resolvePdfPath(request.path)
        .catch(() => null);
      if (!filePath) return fail(stream, "forbidden");
      return sendFile(stream, filePath, "application/pdf", request.range);
    }
    case "imageAttachment": {
      const image = await options.attachments.locateImage(request.file);
      if (!image) return fail(stream, "notFound");
      return sendFile(stream, image.path, image.mimeType, undefined);
    }
    case "attachmentUpload":
      return receiveUpload(stream, request, options.attachments);
  }
}

export function serveRemoteFileStream(
  stream: MuxStream,
  header: Uint8Array,
  options: RemoteFileStreamOptions,
) {
  const run = async () => {
    const request = parseRequest(header);
    if (!request) return fail(stream, "invalid");
    const principal = options.principal();
    if (
      !principal ||
      !principalHasScope(principal, REQUIRED_SCOPE[request.kind])
    ) {
      return fail(stream, "forbidden");
    }
    return serve(stream, request, options);
  };
  void run().catch(() => stream.reset("internal"));
}
