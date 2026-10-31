import {
  acceptChannelHello,
  type ChannelEnvelope,
  createChannelHello,
  createSecureChannel,
  generateKeyPair,
  HandshakeError,
  type MuxStream,
  type SecureChannel,
} from "@cocurdex/secure-channel";
import { describe, expect, it, vi } from "vitest";

const text = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

function handshake(envelope: ChannelEnvelope = { v: 1, mode: "pair" }) {
  const host = generateKeyPair();
  const device = generateKeyPair();
  const client = createChannelHello({
    staticKeyPair: device,
    hostKey: host.publicKey,
    envelope,
    payload: { secret: "s3cret", label: "Phone" },
  });
  const accepted = acceptChannelHello({
    staticKeyPair: host,
    hello: client.hello,
  });
  const reply = accepted.reply({ deviceId: "dev-1" });
  const established = client.finish(reply.message);
  return { host, device, client, accepted, reply, established };
}

async function collect(stream: MuxStream) {
  const parts: string[] = [];
  for await (const chunk of stream.chunks) parts.push(decode(chunk));
  return parts.join("");
}

function connectedPair() {
  const { established, reply } = handshake();
  const hostMessages: string[] = [];
  const deviceMessages: string[] = [];
  const hostStreams: Array<{ stream: MuxStream; header: string }> = [];
  const errors: Error[] = [];
  let hostChannel: SecureChannel | null = null;
  let deviceChannel: SecureChannel | null = null;
  const wire: Uint8Array[] = [];
  deviceChannel = createSecureChannel({
    transport: established.transport,
    role: "initiator",
    send(ciphertext) {
      wire.push(ciphertext);
      queueMicrotask(() => hostChannel?.receive(ciphertext));
    },
    onMessage: (message) => deviceMessages.push(decode(message)),
    onStream: () => {},
    onError: (error) => errors.push(error),
  });
  hostChannel = createSecureChannel({
    transport: reply.transport,
    role: "responder",
    send(ciphertext) {
      wire.push(ciphertext);
      queueMicrotask(() => deviceChannel?.receive(ciphertext));
    },
    onMessage: (message) => hostMessages.push(decode(message)),
    onStream: (stream, header) =>
      hostStreams.push({ stream, header: decode(header) }),
    onError: (error) => errors.push(error),
  });
  return {
    hostChannel,
    deviceChannel,
    hostMessages,
    deviceMessages,
    hostStreams,
    errors,
    wire,
  };
}

describe("channel handshake", () => {
  it("delivers both payloads and authenticates the device key", () => {
    const { device, accepted, established } = handshake({
      v: 1,
      mode: "connect",
      hostId: "host-1",
    });
    expect(accepted.envelope).toEqual({
      v: 1,
      mode: "connect",
      hostId: "host-1",
    });
    expect(accepted.payload).toEqual({ secret: "s3cret", label: "Phone" });
    expect(accepted.remoteStaticKey).toEqual(device.publicKey);
    expect(established.payload).toEqual({ deviceId: "dev-1" });
  });

  it("keeps the handshake payload out of the hello bytes", () => {
    const { client } = handshake();
    expect(decode(client.hello)).not.toContain("s3cret");
    expect(decode(client.hello)).toContain('"mode":"pair"');
  });

  it("fails when the envelope is altered in transit", () => {
    const host = generateKeyPair();
    const client = createChannelHello({
      staticKeyPair: generateKeyPair(),
      hostKey: host.publicKey,
      envelope: { v: 1, mode: "connect", hostId: "aaaa" },
      payload: {},
    });
    const tampered = client.hello.slice();
    const index = decode(tampered).indexOf("aaaa");
    tampered[index] = "b".charCodeAt(0);
    expect(() =>
      acceptChannelHello({ staticKeyPair: host, hello: tampered }),
    ).toThrow(HandshakeError);
  });

  it("fails when the device pinned another host key", () => {
    const client = createChannelHello({
      staticKeyPair: generateKeyPair(),
      hostKey: generateKeyPair().publicKey,
      envelope: { v: 1, mode: "pair" },
      payload: { secret: "x" },
    });
    expect(() =>
      acceptChannelHello({
        staticKeyPair: generateKeyPair(),
        hello: client.hello,
      }),
    ).toThrow(HandshakeError);
  });

  it.each([
    ["truncated", new Uint8Array(1)],
    ["oversized envelope length", Uint8Array.of(0xff, 0xff, 1, 2)],
    ["unknown version", Uint8Array.of(0, 8, ...text('{"v":2}x'))],
  ])("rejects a %s hello", (_name, hello) => {
    expect(() =>
      acceptChannelHello({ staticKeyPair: generateKeyPair(), hello }),
    ).toThrow(HandshakeError);
  });
});

describe("secure channel", () => {
  it("carries messages and streams without plaintext on the wire", async () => {
    const pair = connectedPair();
    await pair.deviceChannel.sendMessage(text('{"method":"ping"}'));
    await pair.hostChannel.sendMessage(text('{"result":"pong"}'));
    const stream = pair.deviceChannel.open(text("workspaceFile"));
    await stream.write(text("file-body-".repeat(10_000)));
    await stream.end();
    await vi.waitFor(() => expect(pair.hostStreams).toHaveLength(1));
    const [opened] = pair.hostStreams;
    if (!opened) throw new Error("No stream was opened");
    const received = await collect(opened.stream);
    expect(pair.hostMessages).toEqual(['{"method":"ping"}']);
    expect(pair.deviceMessages).toEqual(['{"result":"pong"}']);
    expect(opened.header).toBe("workspaceFile");
    expect(received).toBe("file-body-".repeat(10_000));
    const wireText = pair.wire.map(decode).join("");
    expect(wireText).not.toContain("ping");
    expect(wireText).not.toContain("file-body-");
    expect(pair.errors).toEqual([]);
  });

  it("fails the channel on a forged message", async () => {
    const pair = connectedPair();
    pair.hostChannel.receive(new Uint8Array(64));
    expect(pair.errors).toHaveLength(1);
    await expect(
      pair.hostChannel.sendMessage(text("after failure")),
    ).rejects.toThrow();
  });
});
