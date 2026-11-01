import { concatBytes } from "@noble/hashes/utils.js";
import { KEY_LENGTH, TAG_LENGTH } from "./cipher-state";
import { generateKeyPair, type KeyPair } from "./keys";
import { type NoiseCrypto, nobleCrypto } from "./noise-crypto";
import { createSymmetricState } from "./symmetric-state";

export const NOISE_N_PROTOCOL_NAME = "Noise_N_25519_ChaChaPoly_SHA256";
export const SEALED_MESSAGE_OVERHEAD = KEY_LENGTH + TAG_LENGTH;

export class SealedMessageError extends Error {
  override name = "SealedMessageError";
}

export interface SealMessageOptions {
  recipientPublicKey: Uint8Array;
  prologue: Uint8Array;
  plaintext: Uint8Array;
  ephemeralKeyPair?: KeyPair;
  crypto?: NoiseCrypto;
}

export interface OpenMessageOptions {
  recipientKeyPair: KeyPair;
  prologue: Uint8Array;
  message: Uint8Array;
  crypto?: NoiseCrypto;
}

export function sealMessage(options: SealMessageOptions): Uint8Array {
  if (options.recipientPublicKey.length !== KEY_LENGTH) {
    throw new SealedMessageError(
      `Recipient public key must have ${KEY_LENGTH} bytes`,
    );
  }
  const crypto = options.crypto ?? nobleCrypto;
  const symmetric = createSymmetricState(crypto, NOISE_N_PROTOCOL_NAME);
  symmetric.mixHash(options.prologue);
  symmetric.mixHash(options.recipientPublicKey);
  const ephemeral = options.ephemeralKeyPair ?? generateKeyPair(crypto);
  symmetric.mixHash(ephemeral.publicKey);
  symmetric.mixKey(crypto.dh(ephemeral.secretKey, options.recipientPublicKey));
  return concatBytes(
    ephemeral.publicKey,
    symmetric.encryptAndHash(options.plaintext),
  );
}

export function openMessage(options: OpenMessageOptions): Uint8Array {
  if (options.message.length < SEALED_MESSAGE_OVERHEAD) {
    throw new SealedMessageError("Sealed message is too short");
  }
  const crypto = options.crypto ?? nobleCrypto;
  const symmetric = createSymmetricState(crypto, NOISE_N_PROTOCOL_NAME);
  symmetric.mixHash(options.prologue);
  symmetric.mixHash(options.recipientKeyPair.publicKey);
  const ephemeral = options.message.slice(0, KEY_LENGTH);
  symmetric.mixHash(ephemeral);
  try {
    symmetric.mixKey(crypto.dh(options.recipientKeyPair.secretKey, ephemeral));
    return symmetric.decryptAndHash(options.message.slice(KEY_LENGTH));
  } catch (error) {
    throw new SealedMessageError("Sealed message does not open", {
      cause: error,
    });
  }
}
