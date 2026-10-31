import {
  type MuxStream,
  type NoiseCrypto,
  readStreamHead,
} from "@cocurdex/secure-channel";
import type {
  DocumentAttachment,
  ImageAttachment,
  RemoteFileFailure,
  RemoteFileHead,
  RemoteFileRequest,
} from "@cocurdex/shared";
import { connectPairedHost } from "./host-access";
import type { PairedHostEndpoint } from "./platform";
import type { OpenSecureSocket } from "./secure-socket";

export type RemoteFileReadRequest = Exclude<
  RemoteFileRequest,
  { kind: "attachmentUpload" }
>;

export type RemoteFileUploadRequest = Extract<
  RemoteFileRequest,
  { kind: "attachmentUpload" }
>;

export interface RemoteFileRead {
  size: number;
  start: number;
  end: number;
  contentType: string;
  body: AsyncIterable<Uint8Array>;
}

export class RemoteFileError extends Error {
  override name = "RemoteFileError";
  constructor(
    readonly reason: RemoteFileFailure | "unreachable",
    message?: string,
  ) {
    super(message ?? reason);
  }
}

type FailedHead = Extract<RemoteFileHead, { ok: false }>;
type ReadHead = Extract<RemoteFileHead, { contentType: string }>;
type UploadHead = Extract<RemoteFileHead, { uploaded: unknown }>;

const encoder = new TextEncoder();

function isFailure(head: RemoteFileHead): head is FailedHead {
  return head.ok === false;
}

function isReadHead(head: RemoteFileHead): head is ReadHead {
  return head.ok && "contentType" in head;
}

function isUploadHead(head: RemoteFileHead): head is UploadHead {
  return head.ok && "uploaded" in head;
}

async function readHead(stream: MuxStream) {
  try {
    const { head, body } = await readStreamHead(stream.chunks);
    const value = head as RemoteFileHead | null;
    if (!value || typeof value !== "object" || typeof value.ok !== "boolean") {
      throw new RemoteFileError("unreachable", "Malformed file stream head");
    }
    if (isFailure(value)) throw new RemoteFileError(value.error, value.message);
    return { head: value, body };
  } catch (error) {
    if (error instanceof RemoteFileError) throw error;
    throw new RemoteFileError(
      "unreachable",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function* toChunks(source: Uint8Array | AsyncIterable<Uint8Array>) {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  yield* source;
}

export interface RemoteFileClient {
  read(request: RemoteFileReadRequest): Promise<RemoteFileRead>;
  upload(
    request: RemoteFileUploadRequest,
    source: Uint8Array | AsyncIterable<Uint8Array>,
  ): Promise<ImageAttachment | DocumentAttachment>;
  close(): void;
}

export function createRemoteFileClient(options: {
  endpoint(): Promise<PairedHostEndpoint>;
  crypto?: NoiseCrypto;
}): RemoteFileClient {
  let socket: Promise<OpenSecureSocket> | null = null;

  function connect() {
    if (socket) return socket;
    const attempt = options.endpoint().then((endpoint) =>
      connectPairedHost(endpoint, {
        crypto: options.crypto,
        handlers: {
          onMessage: () => {},
          onClose: () => {
            if (socket === attempt) socket = null;
          },
        },
      }),
    );
    socket = attempt;
    attempt.catch(() => {
      if (socket === attempt) socket = null;
    });
    return attempt;
  }

  async function open(request: RemoteFileRequest) {
    try {
      const { channel } = await connect();
      return channel.open(encoder.encode(JSON.stringify(request)));
    } catch (error) {
      throw new RemoteFileError(
        "unreachable",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    async read(request) {
      const stream = await open(request);
      await stream.end();
      const { head, body } = await readHead(stream);
      if (!isReadHead(head)) {
        stream.reset("protocol");
        throw new RemoteFileError("unreachable", "Unexpected file stream head");
      }
      return {
        size: head.size,
        start: head.start,
        end: head.end,
        contentType: head.contentType,
        body,
      };
    },
    async upload(request, source) {
      const stream = await open(request);
      const reply = readHead(stream);
      let answered = false;
      const settled = reply.then(
        () => {
          answered = true;
        },
        () => {
          answered = true;
        },
      );
      for await (const chunk of toChunks(source)) {
        await Promise.race([stream.write(chunk), settled]);
        if (answered) break;
      }
      if (!answered) await Promise.race([stream.end(), settled]);
      const { head } = await reply;
      if (!isUploadHead(head)) {
        throw new RemoteFileError("unreachable", "Unexpected upload reply");
      }
      return head.uploaded;
    },
    close() {
      const current = socket;
      socket = null;
      void current?.then(
        (opened) => opened.close(),
        () => {},
      );
    },
  };
}
