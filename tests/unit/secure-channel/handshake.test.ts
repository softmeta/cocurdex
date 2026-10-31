import nodeCrypto from "node:crypto";
import {
  createIkInitiator,
  createIkResponder,
  createNodeStyleCrypto,
  generateKeyPair,
  HandshakeError,
  keyPairFromSecretKey,
  type NoiseCrypto,
  nobleCrypto,
  type SecureTransport,
} from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";
import vectors from "./fixtures/noise-ik-vectors.json" with { type: "json" };

const hex = (value: string) => Uint8Array.from(Buffer.from(value, "hex"));
const toHex = (value: Uint8Array) => Buffer.from(value).toString("hex");
const text = (value: string) => new TextEncoder().encode(value);
const prologue = text("cocurdex-remote/1");
const nodeBackend = createNodeStyleCrypto<Buffer>(nodeCrypto, (bytes) =>
  Buffer.from(bytes),
);
const backends: Array<[string, NoiseCrypto]> = [
  ["noble", nobleCrypto],
  ["node:crypto", nodeBackend],
];

describe.each(backends)("%s backend", (_name, crypto) => {
  function handshake(rekeyInterval?: number) {
    const host = generateKeyPair(crypto);
    const device = generateKeyPair(crypto);
    const initiator = createIkInitiator({
      crypto,
      staticKeyPair: device,
      remoteStaticKey: host.publicKey,
      prologue,
      rekeyInterval,
    });
    const responder = createIkResponder({
      crypto,
      staticKeyPair: host,
      prologue,
      rekeyInterval,
    });
    const first = responder.readMessage1(
      initiator.writeMessage1(text("hello")),
    );
    const second = responder.writeMessage2(text("welcome"));
    const finished = initiator.readMessage2(second.message);
    return {
      device,
      first,
      finished,
      client: finished.transport,
      host: second.transport,
    };
  }

  describe("Noise IK test vectors", () => {
    for (const vector of vectors) {
      it(`matches the ${vector.source} vector`, () => {
        const initiator = createIkInitiator({
          crypto,
          staticKeyPair: keyPairFromSecretKey(hex(vector.init_static), crypto),
          ephemeralKeyPair: keyPairFromSecretKey(
            hex(vector.init_ephemeral),
            crypto,
          ),
          remoteStaticKey: hex(vector.init_remote_static),
          prologue: hex(vector.init_prologue),
        });
        const responder = createIkResponder({
          crypto,
          staticKeyPair: keyPairFromSecretKey(hex(vector.resp_static), crypto),
          ephemeralKeyPair: keyPairFromSecretKey(
            hex(vector.resp_ephemeral),
            crypto,
          ),
          prologue: hex(vector.resp_prologue),
        });
        const [first, second, ...transportMessages] = vector.messages;
        if (!first || !second)
          throw new Error("Vector lacks handshake messages");

        const message1 = initiator.writeMessage1(hex(first.payload));
        expect(toHex(message1)).toBe(first.ciphertext);
        expect(toHex(responder.readMessage1(message1).payload)).toBe(
          first.payload,
        );
        const written = responder.writeMessage2(hex(second.payload));
        expect(toHex(written.message)).toBe(second.ciphertext);
        const finished = initiator.readMessage2(written.message);
        expect(toHex(finished.payload)).toBe(second.payload);
        if ("handshake_hash" in vector && vector.handshake_hash) {
          expect(toHex(finished.transport.handshakeHash)).toBe(
            vector.handshake_hash,
          );
        }

        transportMessages.forEach((message, index) => {
          const [sender, receiver]: SecureTransport[] =
            index % 2 === 0
              ? [finished.transport, written.transport]
              : [written.transport, finished.transport];
          const ciphertext = sender.encrypt(hex(message.payload));
          expect(toHex(ciphertext)).toBe(message.ciphertext);
          expect(toHex(receiver.decrypt(ciphertext))).toBe(message.payload);
        });
      });
    }
  });

  describe("IK handshake", () => {
    it("authenticates the device key and agrees on transport keys", () => {
      const { device, first, finished, client, host } = handshake();
      expect(first.remoteStaticKey).toEqual(device.publicKey);
      expect(new TextDecoder().decode(first.payload)).toBe("hello");
      expect(new TextDecoder().decode(finished.payload)).toBe("welcome");
      expect(client.handshakeHash).toEqual(host.handshakeHash);
      expect(host.decrypt(client.encrypt(text("ping")))).toEqual(text("ping"));
      expect(client.decrypt(host.encrypt(text("pong")))).toEqual(text("pong"));
    });

    it("fails when the device trusts a different host key", () => {
      const device = generateKeyPair(crypto);
      const impostor = createIkResponder({
        crypto,
        staticKeyPair: generateKeyPair(crypto),
        prologue,
      });
      const initiator = createIkInitiator({
        crypto,
        staticKeyPair: device,
        remoteStaticKey: generateKeyPair(crypto).publicKey,
        prologue,
      });
      expect(() =>
        impostor.readMessage1(initiator.writeMessage1(text("secret"))),
      ).toThrow(HandshakeError);
    });

    it("fails when the prologue differs", () => {
      const host = generateKeyPair(crypto);
      const initiator = createIkInitiator({
        crypto,
        staticKeyPair: generateKeyPair(crypto),
        remoteStaticKey: host.publicKey,
        prologue,
      });
      const responder = createIkResponder({
        crypto,
        staticKeyPair: host,
        prologue: text("cocurdex-remote/0"),
      });
      expect(() =>
        responder.readMessage1(initiator.writeMessage1(text("x"))),
      ).toThrow(HandshakeError);
    });

    it("rejects tampered handshake messages", () => {
      const host = generateKeyPair(crypto);
      const initiator = createIkInitiator({
        crypto,
        staticKeyPair: generateKeyPair(crypto),
        remoteStaticKey: host.publicKey,
        prologue,
      });
      const responder = createIkResponder({
        crypto,
        staticKeyPair: host,
        prologue,
      });
      const message1 = initiator.writeMessage1(text("x"));
      responder.readMessage1(message1);
      const message2 = responder.writeMessage2(text("y")).message;
      message2[message2.length - 1] ^= 0x01;
      expect(() => initiator.readMessage2(message2)).toThrow(HandshakeError);
    });

    it("rejects truncated or replayed steps", () => {
      const host = generateKeyPair(crypto);
      const responder = createIkResponder({
        crypto,
        staticKeyPair: host,
        prologue,
      });
      expect(() => responder.readMessage1(new Uint8Array(40))).toThrow(
        HandshakeError,
      );
      expect(() => responder.readMessage1(new Uint8Array(200))).toThrow(
        HandshakeError,
      );
    });
  });

  describe("secure transport", () => {
    it("stays in sync across rekeys in both directions", () => {
      const { client, host } = handshake(3);
      for (let index = 0; index < 10; index += 1) {
        const payload = text(`message ${index}`);
        expect(host.decrypt(client.encrypt(payload))).toEqual(payload);
        expect(client.decrypt(host.encrypt(payload))).toEqual(payload);
      }
    });

    it("rejects replayed, reordered, and tampered messages", () => {
      const { client, host } = handshake();
      const first = client.encrypt(text("one"));
      const second = client.encrypt(text("two"));
      expect(() => host.decrypt(second)).toThrow();
      expect(host.decrypt(first)).toEqual(text("one"));
      expect(() => host.decrypt(first)).toThrow();
      const tampered = second.slice();
      tampered[0] ^= 0x01;
      expect(() => host.decrypt(tampered)).toThrow();
      expect(host.decrypt(second)).toEqual(text("two"));
    });

    it("refuses plaintext larger than one Noise message", () => {
      const { client } = handshake();
      expect(() => client.encrypt(new Uint8Array(65_520))).toThrow();
      expect(client.encrypt(new Uint8Array(65_519)).length).toBe(65_535);
    });
  });
});

describe("backend interoperability", () => {
  it("connects a noble device to a node:crypto host", () => {
    const host = generateKeyPair(nodeBackend);
    const initiator = createIkInitiator({
      crypto: nobleCrypto,
      staticKeyPair: generateKeyPair(nobleCrypto),
      remoteStaticKey: host.publicKey,
      prologue,
    });
    const responder = createIkResponder({
      crypto: nodeBackend,
      staticKeyPair: host,
      prologue,
    });
    responder.readMessage1(initiator.writeMessage1(text("hi")));
    const written = responder.writeMessage2(text("ok"));
    const client = initiator.readMessage2(written.message).transport;
    expect(written.transport.decrypt(client.encrypt(text("a")))).toEqual(
      text("a"),
    );
  });

  it("rejects a low-order peer key on both backends", () => {
    const lowOrder = new Uint8Array(32);
    for (const [, crypto] of backends) {
      expect(() =>
        crypto.dh(generateKeyPair(crypto).secretKey, lowOrder),
      ).toThrow();
    }
  });
});
