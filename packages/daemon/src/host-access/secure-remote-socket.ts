import {
  acceptChannelHello,
  createSecureChannel,
  type KeyPair,
  type MuxStream,
  type SecureChannel,
} from "@cocurdex/secure-channel";
import type {
  RemoteChannelAccepted,
  RemoteChannelReply,
} from "@cocurdex/shared";
import type { RawData, WebSocket } from "ws";
import type { HostAccessService } from "./host-access-service";
import type { FixedWindowRateLimiter } from "./rate-limiter";

const HANDSHAKE_TIMEOUT_MS = 10_000;

export interface SecureRemoteChannel {
  deviceId: string;
  remoteAddress: string | null;
  channel: SecureChannel;
  onMessage(listener: (message: Uint8Array) => void): void;
  onStream(listener: (stream: MuxStream, header: Uint8Array) => void): void;
  onClose(listener: () => void): void;
  close(): void;
}

export interface SecureRemoteSocketOptions {
  hostAccess: Pick<
    HostAccessService,
    "identity" | "pairDevice" | "connectDevice" | "remoteEndpoints"
  >;
  hostKeys(): KeyPair;
  crypto?: Parameters<typeof acceptChannelHello>[0]["crypto"];
  pairLimiter: FixedWindowRateLimiter;
  connectLimiter: FixedWindowRateLimiter;
  now?(): number;
  onChannel(channel: SecureRemoteChannel): void;
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

function encodePublicKey(key: Uint8Array) {
  return Buffer.from(key).toString("base64url");
}

type Admission =
  | { ok: true; accepted: RemoteChannelAccepted }
  | { ok: false; reason: "rejected" | "rateLimited" };

export function acceptSecureRemoteSocket(
  socket: WebSocket,
  remoteAddress: string | null,
  options: SecureRemoteSocketOptions,
) {
  const timeout = setTimeout(() => socket.terminate(), HANDSHAKE_TIMEOUT_MS);
  socket.once("close", () => clearTimeout(timeout));
  socket.once("message", (data, isBinary) => {
    clearTimeout(timeout);
    if (!isBinary) {
      socket.terminate();
      return;
    }
    void handshake(toBytes(data)).catch(() => socket.terminate());
  });

  const admit = async (
    mode: "pair" | "connect",
    payload: unknown,
    publicKey: string,
    hostId: string | null,
  ): Promise<Admission> => {
    const now = options.now?.() ?? Date.now();
    const key = remoteAddress ?? "unknown";
    const limiter =
      mode === "pair" ? options.pairLimiter : options.connectLimiter;
    if (!limiter.take(key, now)) return { ok: false, reason: "rateLimited" };
    if (mode === "pair") {
      const outcome = options.hostAccess.pairDevice(
        payload,
        publicKey,
        remoteAddress,
      );
      return outcome.ok
        ? { ok: true, accepted: outcome.result }
        : { ok: false, reason: "rejected" };
    }
    if (hostId !== options.hostAccess.identity().hostId) {
      return { ok: false, reason: "rejected" };
    }
    const accepted = options.hostAccess.connectDevice(payload, publicKey);
    return accepted
      ? { ok: true, accepted }
      : { ok: false, reason: "rejected" };
  };

  const handshake = async (hello: Uint8Array) => {
    const opened = acceptChannelHello({
      staticKeyPair: options.hostKeys(),
      crypto: options.crypto,
      hello,
    });
    const { envelope } = opened;
    const admission = await admit(
      envelope.mode,
      opened.payload,
      encodePublicKey(opened.remoteStaticKey),
      envelope.mode === "connect" ? envelope.hostId : null,
    );
    if (socket.readyState !== socket.OPEN) return;
    if (!admission.ok) {
      const reply: RemoteChannelReply = { ok: false, reason: admission.reason };
      socket.send(opened.reply(reply).message, () => socket.close());
      return;
    }
    const endpoints = await options.hostAccess.remoteEndpoints();
    const reply: RemoteChannelReply = {
      ok: true,
      ...admission.accepted,
      endpoints,
    };
    const { message, transport } = opened.reply(reply);
    if (socket.readyState !== socket.OPEN) return;
    socket.send(message);
    startChannel(admission.accepted.deviceId, transport);
  };

  const startChannel = (
    deviceId: string,
    transport: Parameters<typeof createSecureChannel>[0]["transport"],
  ) => {
    let messageListener: (message: Uint8Array) => void = () => {};
    let streamListener: (stream: MuxStream, header: Uint8Array) => void = (
      stream,
    ) => stream.reset("unsupported");
    const channel = createSecureChannel({
      transport,
      role: "responder",
      send: (ciphertext) => {
        if (socket.readyState === socket.OPEN) socket.send(ciphertext);
      },
      onMessage: (message) => messageListener(message),
      onStream: (stream, header) => streamListener(stream, header),
      onError: () => socket.terminate(),
    });
    socket.on("message", (data, isBinary) => {
      if (!isBinary) {
        socket.terminate();
        return;
      }
      channel.receive(toBytes(data));
    });
    socket.once("close", () =>
      channel.close(new Error("Remote connection closed")),
    );
    options.onChannel({
      deviceId,
      remoteAddress,
      channel,
      onMessage: (listener) => {
        messageListener = listener;
      },
      onStream: (listener) => {
        streamListener = listener;
      },
      onClose: (listener) => socket.once("close", listener),
      close: () => socket.terminate(),
    });
  };
}
