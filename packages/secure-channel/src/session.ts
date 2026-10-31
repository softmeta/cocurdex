import { decodeFrame, encodeFrame } from "./frame";
import {
  createIkInitiator,
  createIkResponder,
  HandshakeError,
} from "./handshake";
import type { KeyPair } from "./keys";
import { createMux, type MuxRole, type MuxStream } from "./mux";
import type { NoiseCrypto } from "./noise-crypto";
import type { SecureTransport } from "./transport";

export const SECURE_CHANNEL_VERSION = 1;
export const SECURE_CHANNEL_PROLOGUE_LABEL = "cocurdex-remote/1";
export const SECURE_CHANNEL_WEBSOCKET_PROTOCOL = "cocurdex.secure.v1";

const ENVELOPE_LENGTH_BYTES = 2;
const MAX_ENVELOPE_LENGTH = 1024;
const MAX_HANDSHAKE_PAYLOAD_LENGTH = 16 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export type ChannelEnvelope =
  | { v: typeof SECURE_CHANNEL_VERSION; mode: "pair" }
  | { v: typeof SECURE_CHANNEL_VERSION; mode: "connect"; hostId: string };

function channelPrologue(envelopeBytes: Uint8Array) {
  const label = textEncoder.encode(SECURE_CHANNEL_PROLOGUE_LABEL);
  const prologue = new Uint8Array(label.length + envelopeBytes.length);
  prologue.set(label);
  prologue.set(envelopeBytes, label.length);
  return prologue;
}

function encodeJson(value: unknown) {
  return textEncoder.encode(JSON.stringify(value));
}

function decodeJson(bytes: Uint8Array): unknown {
  if (bytes.length > MAX_HANDSHAKE_PAYLOAD_LENGTH) {
    throw new HandshakeError("Handshake payload is too large");
  }
  try {
    return JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw new HandshakeError("Handshake payload is not JSON");
  }
}

function parseEnvelope(bytes: Uint8Array): ChannelEnvelope {
  const value = decodeJson(bytes) as Record<string, unknown> | null;
  if (!value || typeof value !== "object" || value.v !== 1) {
    throw new HandshakeError("Unsupported channel version");
  }
  if (value.mode === "pair") return { v: 1, mode: "pair" };
  if (
    value.mode === "connect" &&
    typeof value.hostId === "string" &&
    value.hostId.length > 0 &&
    value.hostId.length <= 128
  ) {
    return { v: 1, mode: "connect", hostId: value.hostId };
  }
  throw new HandshakeError("Malformed channel envelope");
}

export interface ChannelHelloOptions {
  staticKeyPair: KeyPair;
  hostKey: Uint8Array;
  envelope: ChannelEnvelope;
  payload: unknown;
  crypto?: NoiseCrypto;
  rekeyInterval?: number;
}

export interface ChannelEstablished {
  payload: unknown;
  transport: SecureTransport;
}

export function createChannelHello(options: ChannelHelloOptions) {
  const envelopeBytes = encodeJson(options.envelope);
  if (envelopeBytes.length > MAX_ENVELOPE_LENGTH) {
    throw new HandshakeError("Channel envelope is too large");
  }
  const initiator = createIkInitiator({
    crypto: options.crypto,
    staticKeyPair: options.staticKeyPair,
    remoteStaticKey: options.hostKey,
    prologue: channelPrologue(envelopeBytes),
    rekeyInterval: options.rekeyInterval,
  });
  const message1 = initiator.writeMessage1(encodeJson(options.payload));
  const hello = new Uint8Array(
    ENVELOPE_LENGTH_BYTES + envelopeBytes.length + message1.length,
  );
  new DataView(hello.buffer).setUint16(0, envelopeBytes.length);
  hello.set(envelopeBytes, ENVELOPE_LENGTH_BYTES);
  hello.set(message1, ENVELOPE_LENGTH_BYTES + envelopeBytes.length);
  return {
    hello,
    finish(reply: Uint8Array): ChannelEstablished {
      const result = initiator.readMessage2(reply);
      return {
        payload: decodeJson(result.payload),
        transport: result.transport,
      };
    },
  };
}

export interface AcceptChannelOptions {
  staticKeyPair: KeyPair;
  hello: Uint8Array;
  crypto?: NoiseCrypto;
  rekeyInterval?: number;
}

export function acceptChannelHello(options: AcceptChannelOptions) {
  const { hello } = options;
  if (hello.length < ENVELOPE_LENGTH_BYTES) {
    throw new HandshakeError("Channel hello is truncated");
  }
  const envelopeLength = new DataView(
    hello.buffer,
    hello.byteOffset,
    hello.byteLength,
  ).getUint16(0);
  const messageStart = ENVELOPE_LENGTH_BYTES + envelopeLength;
  if (envelopeLength > MAX_ENVELOPE_LENGTH || hello.length < messageStart) {
    throw new HandshakeError("Channel hello is malformed");
  }
  const envelopeBytes = hello.subarray(ENVELOPE_LENGTH_BYTES, messageStart);
  const envelope = parseEnvelope(envelopeBytes);
  const responder = createIkResponder({
    crypto: options.crypto,
    staticKeyPair: options.staticKeyPair,
    prologue: channelPrologue(envelopeBytes),
    rekeyInterval: options.rekeyInterval,
  });
  const first = responder.readMessage1(hello.subarray(messageStart));
  return {
    envelope,
    payload: decodeJson(first.payload),
    remoteStaticKey: first.remoteStaticKey,
    reply(payload: unknown) {
      return responder.writeMessage2(encodeJson(payload));
    },
  };
}

export interface SecureChannelOptions {
  transport: SecureTransport;
  role: MuxRole;
  send(ciphertext: Uint8Array): void;
  onMessage(message: Uint8Array): void;
  onStream(stream: MuxStream, header: Uint8Array): void;
  onError(error: Error): void;
  maxMessageLength?: number;
}

export interface SecureChannel {
  receive(ciphertext: Uint8Array): void;
  sendMessage(message: Uint8Array): Promise<void>;
  open(header: Uint8Array): MuxStream;
  close(error: Error): void;
}

export function createSecureChannel(
  options: SecureChannelOptions,
): SecureChannel {
  let failed = false;
  const mux = createMux({
    role: options.role,
    maxMessageLength: options.maxMessageLength,
    onMessage: options.onMessage,
    onStream: options.onStream,
    sendFrame(frame) {
      if (failed) return;
      options.send(options.transport.encrypt(encodeFrame(frame)));
    },
  });
  const fail = (error: Error) => {
    if (failed) return;
    failed = true;
    mux.close(error);
    options.onError(error);
  };
  return {
    receive(ciphertext) {
      if (failed) return;
      try {
        mux.receive(decodeFrame(options.transport.decrypt(ciphertext)));
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    },
    sendMessage: (message) => mux.sendMessage(message),
    open: (header) => mux.open(header),
    close(error) {
      if (failed) return;
      failed = true;
      mux.close(error);
    },
  };
}
