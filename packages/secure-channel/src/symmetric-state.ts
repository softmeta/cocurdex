import { concatBytes } from "@noble/hashes/utils.js";
import { type CipherState, createCipherState } from "./cipher-state";
import type { NoiseCrypto } from "./noise-crypto";

const HASH_LENGTH = 32;
const EMPTY = new Uint8Array(0);

function hkdf(
  crypto: NoiseCrypto,
  chainingKey: Uint8Array,
  inputKeyMaterial: Uint8Array,
) {
  const tempKey = crypto.hmacSha256(chainingKey, inputKeyMaterial);
  const first = crypto.hmacSha256(tempKey, Uint8Array.of(1));
  const second = crypto.hmacSha256(
    tempKey,
    concatBytes(first, Uint8Array.of(2)),
  );
  return [first, second] as const;
}

function initialHash(crypto: NoiseCrypto, protocolName: string) {
  const name = new TextEncoder().encode(protocolName);
  if (name.length > HASH_LENGTH) return crypto.sha256(name);
  const padded = new Uint8Array(HASH_LENGTH);
  padded.set(name);
  return padded;
}

export interface SymmetricState {
  mixHash(data: Uint8Array): void;
  mixKey(inputKeyMaterial: Uint8Array): void;
  encryptAndHash(plaintext: Uint8Array): Uint8Array;
  decryptAndHash(ciphertext: Uint8Array): Uint8Array;
  split(): readonly [CipherState, CipherState];
  handshakeHash(): Uint8Array;
}

export function createSymmetricState(
  crypto: NoiseCrypto,
  protocolName: string,
): SymmetricState {
  let hash = initialHash(crypto, protocolName);
  let chainingKey = hash;
  let cipher = createCipherState(crypto);

  const mixHash = (data: Uint8Array) => {
    hash = crypto.sha256(concatBytes(hash, data));
  };

  return {
    mixHash,
    mixKey(inputKeyMaterial) {
      const [nextChainingKey, key] = hkdf(
        crypto,
        chainingKey,
        inputKeyMaterial,
      );
      chainingKey = nextChainingKey;
      cipher = createCipherState(crypto, key);
    },
    encryptAndHash(plaintext) {
      const ciphertext = cipher.encryptWithAd(hash, plaintext);
      mixHash(ciphertext);
      return ciphertext;
    },
    decryptAndHash(ciphertext) {
      const plaintext = cipher.decryptWithAd(hash, ciphertext);
      mixHash(ciphertext);
      return plaintext;
    },
    split() {
      const [first, second] = hkdf(crypto, chainingKey, EMPTY);
      return [
        createCipherState(crypto, first),
        createCipherState(crypto, second),
      ] as const;
    },
    handshakeHash: () => hash,
  };
}
