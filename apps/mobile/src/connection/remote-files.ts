import {
  createRemoteFileClient,
  type RemoteFileClient,
  type RemoteFileReadRequest,
  savedHostEndpoint,
} from "@cocurdex/client-runtime";
import type { ImageAttachment } from "@cocurdex/shared";
import { Directory, File, Paths } from "expo-file-system";
import { hosts, mobileNoiseCrypto } from "@/hosts";

const clients = new Map<string, RemoteFileClient>();
const downloads = new Map<string, Promise<string>>();

function pairedHost(hostId: string) {
  const host = hosts.getSnapshot().find((saved) => saved.hostId === hostId);
  if (!host) throw new Error("This computer is no longer paired");
  return host;
}

export function hostFiles(hostId: string): RemoteFileClient {
  const existing = clients.get(hostId);
  if (existing) return existing;
  const client = createRemoteFileClient({
    endpoint: async () => savedHostEndpoint(pairedHost(hostId)),
    crypto: mobileNoiseCrypto,
  });
  clients.set(hostId, client);
  return client;
}

hosts.subscribe(() => {
  const paired = new Set(hosts.getSnapshot().map((host) => host.hostId));
  for (const [hostId, client] of clients) {
    if (paired.has(hostId)) continue;
    client.close();
    clients.delete(hostId);
  }
});

function cacheName(request: RemoteFileReadRequest) {
  const key = request.kind === "imageAttachment" ? request.file : request.path;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193) >>> 0;
  }
  const extension = /\.[A-Za-z0-9]{1,8}$/.exec(key)?.[0] ?? "";
  return `${request.kind}-${hash.toString(16)}-${key.length}${extension}`;
}

function immutable(request: RemoteFileReadRequest) {
  return request.kind === "imageAttachment";
}

async function download(
  hostId: string,
  request: RemoteFileReadRequest,
  target: File,
) {
  if (immutable(request) && target.exists) return target.uri;
  const read = await hostFiles(hostId).read(request);
  const partial = new File(target.parentDirectory, `.${target.name}.partial`);
  if (partial.exists) partial.delete();
  partial.create();
  const handle = partial.open();
  try {
    for await (const chunk of read.body) await handle.writeBytes(chunk);
  } finally {
    handle.close();
  }
  if (target.exists) target.delete();
  partial.move(target);
  return target.uri;
}

export function remoteFileUri(hostId: string, request: RemoteFileReadRequest) {
  const directory = new Directory(Paths.cache, "remote-files", hostId);
  if (!directory.exists) directory.create({ intermediates: true });
  const target = new File(directory, cacheName(request));
  const key = target.uri;
  const pending = downloads.get(key);
  if (pending) return pending;
  const started = download(hostId, request, target).finally(() => {
    if (!immutable(request)) downloads.delete(key);
  });
  started.catch(() => downloads.delete(key));
  downloads.set(key, started);
  return started;
}

export async function readRemoteRange(
  hostId: string,
  request: Extract<RemoteFileReadRequest, { kind: "workspaceFile" }>,
) {
  const read = await hostFiles(hostId).read(request);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of read.body) {
    chunks.push(chunk);
    length += chunk.length;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { size: read.size, bytes };
}

async function* fileChunks(uri: string) {
  const reader = new File(uri).readableStream().getReader();
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

export async function uploadRemoteImage(
  hostId: string,
  image: { uri: string; name: string },
) {
  const uploaded = await hostFiles(hostId).upload(
    { kind: "attachmentUpload", upload: "image", name: image.name },
    fileChunks(image.uri),
  );
  return uploaded as ImageAttachment;
}
