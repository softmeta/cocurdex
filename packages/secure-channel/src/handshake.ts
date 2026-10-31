import { concatBytes } from "@noble/hashes/utils.js";
import { KEY_LENGTH, TAG_LENGTH } from "./cipher-state";
import { generateKeyPair, type KeyPair } from "./keys";
import { type NoiseCrypto, nobleCrypto } from "./noise-crypto";
import { createSymmetricState } from "./symmetric-state";
import { createSecureTransport, type SecureTransport } from "./transport";

export const NOISE_IK_PROTOCOL_NAME = "Noise_IK_25519_ChaChaPoly_SHA256";

const ENCRYPTED_KEY_LENGTH = KEY_LENGTH + TAG_LENGTH;
const MESSAGE1_MIN_LENGTH = KEY_LENGTH + ENCRYPTED_KEY_LENGTH + TAG_LENGTH;
const MESSAGE2_MIN_LENGTH = KEY_LENGTH + TAG_LENGTH;

export class HandshakeError extends Error {
  override name = "HandshakeError";
}

export interface HandshakeOptions {
  staticKeyPair: KeyPair;
  prologue: Uint8Array;
  ephemeralKeyPair?: KeyPair;
  rekeyInterval?: number;
  crypto?: NoiseCrypto;
}

export interface InitiatorOptions extends HandshakeOptions {
  remoteStaticKey: Uint8Array;
}

export interface HandshakeResult {
  payload: Uint8Array;
  transport: SecureTransport;
}

export interface IkInitiator {
  writeMessage1(payload: Uint8Array): Uint8Array;
  readMessage2(message: Uint8Array): HandshakeResult;
}

export interface IkResponder {
  readMessage1(message: Uint8Array): {
    payload: Uint8Array;
    remoteStaticKey: Uint8Array;
  };
  writeMessage2(payload: Uint8Array): {
    message: Uint8Array;
    transport: SecureTransport;
  };
}

function guard<T>(step: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof HandshakeError) throw error;
    throw new HandshakeError(`Handshake failed at ${step}`, { cause: error });
  }
}

function expectStep(actual: string, expected: string) {
  if (actual !== expected) {
    throw new HandshakeError(
      `Expected ${expected}, but the state is ${actual}`,
    );
  }
}

function assertKeyLength(key: Uint8Array, label: string) {
  if (key.length !== KEY_LENGTH) {
    throw new HandshakeError(`${label} must have ${KEY_LENGTH} bytes`);
  }
}

export function createIkInitiator(options: InitiatorOptions): IkInitiator {
  assertKeyLength(options.remoteStaticKey, "Remote static key");
  const crypto = options.crypto ?? nobleCrypto;
  const dh = (pair: KeyPair, publicKey: Uint8Array) =>
    crypto.dh(pair.secretKey, publicKey);
  const symmetric = createSymmetricState(crypto, NOISE_IK_PROTOCOL_NAME);
  symmetric.mixHash(options.prologue);
  symmetric.mixHash(options.remoteStaticKey);
  const ephemeral = options.ephemeralKeyPair ?? generateKeyPair(crypto);
  let step = "write1";

  return {
    writeMessage1(payload) {
      expectStep(step, "write1");
      step = "failed";
      symmetric.mixHash(ephemeral.publicKey);
      symmetric.mixKey(dh(ephemeral, options.remoteStaticKey));
      const encryptedStatic = symmetric.encryptAndHash(
        options.staticKeyPair.publicKey,
      );
      symmetric.mixKey(dh(options.staticKeyPair, options.remoteStaticKey));
      const encryptedPayload = symmetric.encryptAndHash(payload);
      step = "read2";
      return concatBytes(
        ephemeral.publicKey,
        encryptedStatic,
        encryptedPayload,
      );
    },
    readMessage2(message) {
      expectStep(step, "read2");
      step = "failed";
      if (message.length < MESSAGE2_MIN_LENGTH) {
        throw new HandshakeError("Handshake message 2 is too short");
      }
      return guard("message 2", () => {
        const remoteEphemeral = message.slice(0, KEY_LENGTH);
        symmetric.mixHash(remoteEphemeral);
        symmetric.mixKey(dh(ephemeral, remoteEphemeral));
        symmetric.mixKey(dh(options.staticKeyPair, remoteEphemeral));
        const payload = symmetric.decryptAndHash(message.slice(KEY_LENGTH));
        const [send, receive] = symmetric.split();
        step = "done";
        return {
          payload,
          transport: createSecureTransport({
            send,
            receive,
            handshakeHash: symmetric.handshakeHash(),
            rekeyInterval: options.rekeyInterval,
          }),
        };
      });
    },
  };
}

export function createIkResponder(options: HandshakeOptions): IkResponder {
  const crypto = options.crypto ?? nobleCrypto;
  const dh = (pair: KeyPair, publicKey: Uint8Array) =>
    crypto.dh(pair.secretKey, publicKey);
  const symmetric = createSymmetricState(crypto, NOISE_IK_PROTOCOL_NAME);
  symmetric.mixHash(options.prologue);
  symmetric.mixHash(options.staticKeyPair.publicKey);
  const ephemeral = options.ephemeralKeyPair ?? generateKeyPair(crypto);
  let remoteEphemeral: Uint8Array | null = null;
  let remoteStatic: Uint8Array | null = null;
  let step = "read1";

  return {
    readMessage1(message) {
      expectStep(step, "read1");
      step = "failed";
      if (message.length < MESSAGE1_MIN_LENGTH) {
        throw new HandshakeError("Handshake message 1 is too short");
      }
      return guard("message 1", () => {
        const peerEphemeral = message.slice(0, KEY_LENGTH);
        symmetric.mixHash(peerEphemeral);
        symmetric.mixKey(dh(options.staticKeyPair, peerEphemeral));
        const staticEnd = KEY_LENGTH + ENCRYPTED_KEY_LENGTH;
        const peerStatic = symmetric.decryptAndHash(
          message.slice(KEY_LENGTH, staticEnd),
        );
        symmetric.mixKey(dh(options.staticKeyPair, peerStatic));
        const payload = symmetric.decryptAndHash(message.slice(staticEnd));
        remoteEphemeral = peerEphemeral;
        remoteStatic = peerStatic;
        step = "write2";
        return { payload, remoteStaticKey: peerStatic };
      });
    },
    writeMessage2(payload) {
      expectStep(step, "write2");
      step = "failed";
      if (!remoteEphemeral || !remoteStatic) {
        throw new HandshakeError("Handshake message 1 was not read");
      }
      symmetric.mixHash(ephemeral.publicKey);
      symmetric.mixKey(dh(ephemeral, remoteEphemeral));
      symmetric.mixKey(dh(ephemeral, remoteStatic));
      const encryptedPayload = symmetric.encryptAndHash(payload);
      const [receive, send] = symmetric.split();
      step = "done";
      return {
        message: concatBytes(ephemeral.publicKey, encryptedPayload),
        transport: createSecureTransport({
          send,
          receive,
          handshakeHash: symmetric.handshakeHash(),
          rekeyInterval: options.rekeyInterval,
        }),
      };
    },
  };
}
