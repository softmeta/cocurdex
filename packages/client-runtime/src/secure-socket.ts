import {
  type ChannelEnvelope,
  createChannelHello,
  createSecureChannel,
  decodeBase64Url,
  type KeyPair,
  type MuxStream,
  type NoiseCrypto,
  SECURE_CHANNEL_WEBSOCKET_PROTOCOL,
  type SecureChannel,
} from "@cocurdex/secure-channel";
import type {
  RemoteChannelAccepted,
  RemoteChannelReply,
} from "@cocurdex/shared";
import { HostAccessError } from "./host-access-error";

const HANDSHAKE_TIMEOUT_MS = 10_000;

export interface SecureSocketHandlers {
  onMessage(message: Uint8Array): void;
  onStream?(stream: MuxStream, header: Uint8Array): void;
  onClose(): void;
}

export interface SecureSocketOptions {
  url: string;
  hostKey: string;
  deviceKeyPair: KeyPair;
  envelope: ChannelEnvelope;
  payload: unknown;
  crypto?: NoiseCrypto;
  timeoutMs?: number;
  handlers?: SecureSocketHandlers;
}

export interface OpenSecureSocket {
  accepted: RemoteChannelAccepted;
  channel: SecureChannel;
  close(): void;
}

const idleHandlers: SecureSocketHandlers = {
  onMessage: () => {},
  onClose: () => {},
};

function webSocketUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function sendable(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? (bytes as Uint8Array<ArrayBuffer>)
    : Uint8Array.from(bytes);
}

function readReply(value: unknown): RemoteChannelReply {
  const reply = value as RemoteChannelReply | null;
  if (reply && typeof reply === "object" && typeof reply.ok === "boolean") {
    return reply;
  }
  throw new HostAccessError("unreachable", "The host sent a malformed reply");
}

function rejection(reply: Extract<RemoteChannelReply, { ok: false }>) {
  return reply.reason === "rateLimited"
    ? new HostAccessError("rateLimited", "Too many attempts")
    : new HostAccessError("invalid", "The host rejected this device");
}

export function openSecureSocket(
  options: SecureSocketOptions,
): Promise<OpenSecureSocket> {
  const handlers = options.handlers ?? idleHandlers;
  let hello: ReturnType<typeof createChannelHello>;
  try {
    hello = createChannelHello({
      crypto: options.crypto,
      staticKeyPair: options.deviceKeyPair,
      hostKey: decodeBase64Url(options.hostKey),
      envelope: options.envelope,
      payload: options.payload,
    });
  } catch {
    return Promise.reject(
      new HostAccessError("invalid", "The host key is not valid"),
    );
  }
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(webSocketUrl(options.url), [
        SECURE_CHANNEL_WEBSOCKET_PROTOCOL,
      ]);
    } catch (error) {
      reject(new HostAccessError("unreachable", String(error)));
      return;
    }
    socket.binaryType = "arraybuffer";
    let channel: SecureChannel | null = null;
    let settled = false;
    const fail = (error: HostAccessError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      reject(error);
    };
    const timeout = setTimeout(
      () => fail(new HostAccessError("unreachable", "The host did not answer")),
      options.timeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    );
    const close = () => socket.close();
    socket.addEventListener("open", () => socket.send(hello.hello));
    socket.addEventListener("message", (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        fail(new HostAccessError("unreachable", "Unexpected text frame"));
        return;
      }
      const bytes = new Uint8Array(event.data);
      if (channel) {
        channel.receive(bytes);
        return;
      }
      try {
        const established = hello.finish(bytes);
        const reply = readReply(established.payload);
        if (!reply.ok) {
          fail(rejection(reply));
          return;
        }
        const { ok: _ok, ...accepted } = reply;
        channel = createSecureChannel({
          transport: established.transport,
          role: "initiator",
          send: (ciphertext) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(sendable(ciphertext));
            }
          },
          onMessage: handlers.onMessage,
          onStream:
            handlers.onStream ?? ((stream) => stream.reset("unsupported")),
          onError: close,
        });
        settled = true;
        clearTimeout(timeout);
        resolve({ accepted, channel, close });
      } catch (error) {
        fail(
          error instanceof HostAccessError
            ? error
            : new HostAccessError("unreachable", "The host key did not match"),
        );
      }
    });
    socket.addEventListener("close", () => {
      fail(
        new HostAccessError("unreachable", "The host closed the connection"),
      );
      if (!channel) return;
      channel.close(new Error("Connection closed"));
      handlers.onClose();
    });
    socket.addEventListener("error", () => {
      fail(new HostAccessError("unreachable", "The connection failed"));
    });
  });
}
