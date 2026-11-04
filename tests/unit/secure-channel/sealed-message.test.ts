import nodeCrypto from "node:crypto";
import {
  createNodeStyleCrypto,
  generateKeyPair,
  keyPairFromSecretKey,
  type NoiseCrypto,
  nobleCrypto,
  openMessage,
  SealedMessageError,
  sealMessage,
} from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";
import vector from "./fixtures/noise-n-vector.json" with { type: "json" };

const hex = (value: string) => Uint8Array.from(Buffer.from(value, "hex"));
const toHex = (value: Uint8Array) => Buffer.from(value).toString("hex");
const text = (value: string) => new TextEncoder().encode(value);
const backends: Array<[string, NoiseCrypto]> = [
  ["noble", nobleCrypto],
  [
    "node:crypto",
    createNodeStyleCrypto<Buffer>(nodeCrypto, (bytes) => Buffer.from(bytes)),
  ],
];

describe.each(backends)("%s backend", (_name, crypto) => {
  it("matches the cacophony Noise N vector", () => {
    const recipient = keyPairFromSecretKey(hex(vector.resp_static), crypto);
    expect(toHex(recipient.publicKey)).toBe(vector.init_remote_static);
    const sealed = sealMessage({
      crypto,
      recipientPublicKey: recipient.publicKey,
      prologue: hex(vector.init_prologue),
      plaintext: hex(vector.payload),
      ephemeralKeyPair: keyPairFromSecretKey(
        hex(vector.init_ephemeral),
        crypto,
      ),
    });
    expect(toHex(sealed)).toBe(vector.ciphertext);
    const opened = openMessage({
      crypto,
      recipientKeyPair: recipient,
      prologue: hex(vector.resp_prologue),
      message: sealed,
    });
    expect(toHex(opened)).toBe(vector.payload);
  });

  it("refuses a message sealed for another key or prologue", () => {
    const recipient = generateKeyPair(crypto);
    const sealed = sealMessage({
      crypto,
      recipientPublicKey: recipient.publicKey,
      prologue: text("cocurdex-push/1"),
      plaintext: text("approve?"),
    });
    expect(() =>
      openMessage({
        crypto,
        recipientKeyPair: generateKeyPair(crypto),
        prologue: text("cocurdex-push/1"),
        message: sealed,
      }),
    ).toThrow(SealedMessageError);
    expect(() =>
      openMessage({
        crypto,
        recipientKeyPair: recipient,
        prologue: text("cocurdex-push/2"),
        message: sealed,
      }),
    ).toThrow(SealedMessageError);
    expect(() =>
      openMessage({
        crypto,
        recipientKeyPair: recipient,
        prologue: text("cocurdex-push/1"),
        message: sealed.slice(0, 20),
      }),
    ).toThrow(SealedMessageError);
  });
});
