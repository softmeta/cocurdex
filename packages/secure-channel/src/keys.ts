import { KEY_LENGTH } from "./cipher-state";
import { type NoiseCrypto, nobleCrypto } from "./noise-crypto";

export interface KeyPair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

export const PUBLIC_KEY_LENGTH = KEY_LENGTH;

export function generateKeyPair(crypto: NoiseCrypto = nobleCrypto): KeyPair {
  return keyPairFromSecretKey(crypto.randomSecretKey(), crypto);
}

export function keyPairFromSecretKey(
  secretKey: Uint8Array,
  crypto: NoiseCrypto = nobleCrypto,
): KeyPair {
  if (secretKey.length !== KEY_LENGTH) {
    throw new Error(`An X25519 secret key has ${KEY_LENGTH} bytes`);
  }
  return { secretKey, publicKey: crypto.publicKey(secretKey) };
}
