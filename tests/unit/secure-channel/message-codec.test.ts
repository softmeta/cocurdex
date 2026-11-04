import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  acceptChannelHello,
  createChannelHello,
  createSecureChannel,
  decodeChannelMessage,
  encodeChannelMessage,
  generateKeyPair,
  MessageCodecError,
  type MessageCompressor,
  MIN_COMPRESSED_MESSAGE_LENGTH,
  type SecureChannel,
} from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";

const compressor: MessageCompressor = {
  deflateRaw: (data) => deflateRawSync(data),
  inflateRaw: (data, maxLength) =>
    inflateRawSync(data, { maxOutputLength: maxLength }),
};

const text = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

function connectedPair(options: { receiverMaxMessageLength?: number } = {}) {
  const host = generateKeyPair();
  const device = generateKeyPair();
  const client = createChannelHello({
    staticKeyPair: device,
    hostKey: host.publicKey,
    envelope: { v: 1, mode: "pair" },
    payload: {},
  });
  const reply = acceptChannelHello({
    staticKeyPair: host,
    hello: client.hello,
  }).reply({});
  const established = client.finish(reply.message);
  const received: string[] = [];
  const errors: Error[] = [];
  let wireBytes = 0;
  let hostChannel: SecureChannel | null = null;
  const deviceChannel = createSecureChannel({
    transport: established.transport,
    role: "initiator",
    compressor,
    send(ciphertext) {
      wireBytes += ciphertext.length;
      queueMicrotask(() => hostChannel?.receive(ciphertext));
    },
    onMessage: () => {},
    onStream: () => {},
    onError: (error) => errors.push(error),
  });
  hostChannel = createSecureChannel({
    transport: reply.transport,
    role: "responder",
    compressor,
    maxMessageLength: options.receiverMaxMessageLength,
    send: () => {},
    onMessage: (message) => received.push(decode(message)),
    onStream: () => {},
    onError: (error) => errors.push(error),
  });
  return { deviceChannel, received, errors, wireBytes: () => wireBytes };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("compressed channel messages", () => {
  it("delivers large messages intact while sending fewer bytes", async () => {
    const pair = connectedPair();
    const message = JSON.stringify(
      Array.from({ length: 2000 }, (_, index) => ({ id: index, kind: "msg" })),
    );
    pair.deviceChannel.sendMessage(text(message));
    pair.deviceChannel.sendMessage(text("small"));
    await settle();
    expect(pair.received).toEqual([message, "small"]);
    expect(pair.errors).toEqual([]);
    expect(pair.wireBytes()).toBeLessThan(message.length / 4);
  });

  it("fails the channel when a message inflates past the limit", async () => {
    const pair = connectedPair({ receiverMaxMessageLength: 64 * 1024 });
    pair.deviceChannel.sendMessage(new Uint8Array(1024 * 1024));
    await settle();
    expect(pair.received).toEqual([]);
    expect(pair.errors.length).toBeGreaterThan(0);
  });
});

describe("channel message codec", () => {
  it("leaves short and incompressible messages uncompressed", () => {
    const short = text("x".repeat(MIN_COMPRESSED_MESSAGE_LENGTH - 1));
    const random = crypto.getRandomValues(new Uint8Array(4096));
    for (const message of [short, random]) {
      const encoded = encodeChannelMessage(message, compressor);
      expect(encoded.length).toBe(message.length + 1);
      expect(decodeChannelMessage(encoded, compressor, 1 << 20)).toEqual(
        message,
      );
    }
  });

  it("rejects an unknown encoding", () => {
    expect(() =>
      decodeChannelMessage(new Uint8Array([7, 1, 2]), compressor, 1024),
    ).toThrow(MessageCodecError);
  });
});
