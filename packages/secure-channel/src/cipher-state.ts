import type { NoiseCrypto } from "./noise-crypto";

export const KEY_LENGTH = 32;
export const TAG_LENGTH = 16;

const NONCE_LENGTH = 12;
const EMPTY = new Uint8Array(0);

function counterNonce(counter: number) {
  const nonce = new Uint8Array(NONCE_LENGTH);
  const view = new DataView(nonce.buffer);
  view.setUint32(4, counter >>> 0, true);
  view.setUint32(8, Math.floor(counter / 0x1_0000_0000), true);
  return nonce;
}

function rekeyNonce() {
  const nonce = new Uint8Array(NONCE_LENGTH);
  nonce.fill(0xff, 4);
  return nonce;
}

export interface CipherState {
  hasKey(): boolean;
  encryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Uint8Array;
  decryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  rekey(): void;
}

export function createCipherState(
  crypto: NoiseCrypto,
  initialKey: Uint8Array | null = null,
) {
  let key = initialKey;
  let counter = 0;

  const nextNonce = () => {
    if (counter >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Cipher nonce exhausted");
    }
    return counterNonce(counter);
  };

  const state: CipherState = {
    hasKey: () => key !== null,
    encryptWithAd(ad, plaintext) {
      if (!key) return plaintext;
      const sealed = crypto.seal(key, nextNonce(), ad, plaintext);
      counter += 1;
      return sealed;
    },
    decryptWithAd(ad, ciphertext) {
      if (!key) return ciphertext;
      const opened = crypto.open(key, nextNonce(), ad, ciphertext);
      counter += 1;
      return opened;
    },
    rekey() {
      if (!key) throw new Error("Cannot rekey a cipher without a key");
      const sealed = crypto.seal(
        key,
        rekeyNonce(),
        EMPTY,
        new Uint8Array(KEY_LENGTH),
      );
      key = sealed.slice(0, KEY_LENGTH);
    },
  };
  return state;
}
