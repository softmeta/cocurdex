import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

export interface NoiseCrypto {
  randomSecretKey(): Uint8Array;
  publicKey(secretKey: Uint8Array): Uint8Array;
  dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array;
  seal(
    key: Uint8Array,
    nonce: Uint8Array,
    ad: Uint8Array,
    plaintext: Uint8Array,
  ): Uint8Array;
  open(
    key: Uint8Array,
    nonce: Uint8Array,
    ad: Uint8Array,
    ciphertext: Uint8Array,
  ): Uint8Array;
  sha256(data: Uint8Array): Uint8Array;
  hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array;
}

export const nobleCrypto: NoiseCrypto = {
  randomSecretKey: () => x25519.utils.randomSecretKey(),
  publicKey: (secretKey) => x25519.getPublicKey(secretKey),
  dh: (secretKey, publicKey) => x25519.getSharedSecret(secretKey, publicKey),
  seal: (key, nonce, ad, plaintext) =>
    chacha20poly1305(key, nonce, ad).encrypt(plaintext),
  open: (key, nonce, ad, ciphertext) =>
    chacha20poly1305(key, nonce, ad).decrypt(ciphertext),
  sha256: (data) => sha256(data),
  hmacSha256: (key, data) => hmac(sha256, key, data),
};
