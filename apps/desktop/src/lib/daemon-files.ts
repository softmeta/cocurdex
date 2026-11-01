import {
  createRemoteFileClient,
  type PairedHostEndpoint,
  type RemoteFileClient,
  type RemoteFileRead,
} from "@cocurdex/client-runtime";
import {
  type AttachmentUploadKind,
  buildDaemonAttachmentUploadUrl,
  buildDaemonDeckAssetUrl,
  buildDaemonDeckDownloadUrl,
  buildDaemonImageAttachmentUrl,
  buildDaemonPdfUrl,
  DAEMON_DECK_DOWNLOAD_TICKET_QUERY,
  type DeckDownload,
  type DocumentAttachment,
  type ImageAttachment,
} from "@cocurdex/shared";
import { resolveLocalDaemonConnection } from "./daemon-client";
import { getHostBridge } from "./host-bridge";

export type DaemonBlobRequest =
  | { kind: "imageAttachment"; file: string }
  | { kind: "deckAsset"; hash: string };

export interface PdfRangeReader {
  length: number;
  initialData: Uint8Array;
  read(begin: number, end: number): Promise<Uint8Array>;
}

export type PdfSource =
  | { kind: "url"; url: string; httpHeaders: Record<string, string> }
  | { kind: "range"; path: string; reader: PdfRangeReader };

interface UploadResultByKind {
  image: ImageAttachment;
  document: DocumentAttachment;
}

const PDF_INITIAL_BYTES = 64 * 1024;

let remoteFiles: { host: PairedHostEndpoint; client: RemoteFileClient } | null =
  null;

function pairedHost() {
  return getHostBridge()?.pairedHost ?? null;
}

function remoteFileClient(host: PairedHostEndpoint) {
  if (remoteFiles?.host !== host) {
    remoteFiles?.client.close();
    remoteFiles = {
      host,
      client: createRemoteFileClient({ endpoint: async () => host }),
    };
  }
  return remoteFiles.client;
}

async function readAll(read: RemoteFileRead) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for await (const chunk of read.body) chunks.push(Uint8Array.from(chunk));
  return chunks;
}

async function readBytes(read: RemoteFileRead) {
  const chunks = await readAll(read);
  const bytes = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function localBlobUrl(webSocketUrl: string, request: DaemonBlobRequest) {
  return request.kind === "imageAttachment"
    ? buildDaemonImageAttachmentUrl(webSocketUrl, request.file)
    : buildDaemonDeckAssetUrl(webSocketUrl, request.hash);
}

export async function readDaemonBlob(request: DaemonBlobRequest) {
  const host = pairedHost();
  if (host) {
    const read = await remoteFileClient(host).read(request);
    return new Blob(await readAll(read), { type: read.contentType });
  }
  const connection = await resolveLocalDaemonConnection();
  const response = await fetch(localBlobUrl(connection.webSocketUrl, request), {
    headers: { Authorization: `Bearer ${connection.token}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

async function readUploadError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {}
  return `Attachment upload failed (HTTP ${response.status})`;
}

async function* blobChunks(file: Blob) {
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function uploadAttachment<K extends AttachmentUploadKind>(
  kind: K,
  file: Blob,
  name: string,
): Promise<UploadResultByKind[K]> {
  const host = pairedHost();
  if (host) {
    const uploaded = await remoteFileClient(host).upload(
      { kind: "attachmentUpload", upload: kind, name },
      blobChunks(file),
    );
    return uploaded as UploadResultByKind[K];
  }
  const connection = await resolveLocalDaemonConnection();
  const response = await fetch(
    buildDaemonAttachmentUploadUrl(connection.webSocketUrl, kind, name),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    },
  );
  if (!response.ok) throw new Error(await readUploadError(response));
  return (await response.json()) as UploadResultByKind[K];
}

function remotePdfReader(
  client: RemoteFileClient,
  path: string,
): Promise<PdfRangeReader> {
  const read = async (begin: number, end: number) =>
    readBytes(
      await client.read({ kind: "pdf", path, range: { start: begin, end } }),
    );
  return client
    .read({
      kind: "pdf",
      path,
      range: { start: 0, end: PDF_INITIAL_BYTES - 1 },
    })
    .then(async (first) => ({
      length: first.size,
      initialData: await readBytes(first),
      read: (begin, end) => read(begin, end - 1),
    }));
}

export async function resolvePdfSource(filePath: string): Promise<PdfSource> {
  const host = pairedHost();
  if (host) {
    return {
      kind: "range",
      path: filePath,
      reader: await remotePdfReader(remoteFileClient(host), filePath),
    };
  }
  const connection = await resolveLocalDaemonConnection();
  return {
    kind: "url",
    url: buildDaemonPdfUrl(connection.webSocketUrl, filePath),
    httpHeaders: { Authorization: `Bearer ${connection.token}` },
  };
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function saveDeckDownload(download: DeckDownload) {
  const host = pairedHost();
  if (host) {
    const ticket =
      new URL(download.path, "http://host").searchParams.get(
        DAEMON_DECK_DOWNLOAD_TICKET_QUERY,
      ) ?? "";
    const read = await remoteFileClient(host).read({
      kind: "deckDownload",
      ticket,
    });
    saveBlob(
      new Blob(await readAll(read), { type: read.contentType }),
      read.fileName ?? download.fileName,
    );
    return;
  }
  const connection = await resolveLocalDaemonConnection();
  await getHostBridge()?.downloadUrl(
    buildDaemonDeckDownloadUrl(connection.webSocketUrl, download),
  );
}
