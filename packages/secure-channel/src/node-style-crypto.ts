import { type NoiseCrypto, nobleCrypto } from "./noise-crypto";

const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const AEAD_ALGORITHM = "chacha20-poly1305";
const X25519_PKCS8_PREFIX = Uint8Array.of(
  0x30,
  0x2e,
  0x02,
  0x01,
  0x00,
  0x30,
  0x05,
  0x06,
  0x03,
  0x2b,
  0x65,
  0x6e,
  0x04,
  0x22,
  0x04,
  0x20,
);
const X25519_SPKI_PREFIX = Uint8Array.of(
  0x30,
  0x2a,
  0x30,
  0x05,
  0x06,
  0x03,
  0x2b,
  0x65,
  0x6e,
  0x03,
  0x21,
  0x00,
);

type Bytes = Uint8Array;

interface AeadCipher {
  setAAD(ad: Bytes, options: { plaintextLength: number }): unknown;
  update(data: Bytes): Bytes;
  final(): Bytes;
}

interface AeadEncipher extends AeadCipher {
  getAuthTag(): Bytes;
}

interface AeadDecipher extends AeadCipher {
  setAuthTag(tag: Bytes): unknown;
}

interface Digest {
  update(data: Bytes): Digest;
  digest(): Bytes;
}

interface KeyInput<KeyBytes, Type extends "pkcs8" | "spki"> {
  key: KeyBytes;
  format: "der";
  type: Type;
}

export interface NodeStyleCryptoApi<KeyBytes extends Bytes = Bytes> {
  randomBytes(size: number): Bytes;
  getCiphers(): string[];
  createCipheriv(
    algorithm: typeof AEAD_ALGORITHM,
    key: Bytes,
    nonce: Bytes,
    options: { authTagLength: number },
  ): AeadEncipher;
  createDecipheriv(
    algorithm: typeof AEAD_ALGORITHM,
    key: Bytes,
    nonce: Bytes,
    options: { authTagLength: number },
  ): AeadDecipher;
  createHash(algorithm: "sha256"): Digest;
  createHmac(algorithm: "sha256", key: Bytes): Digest;
  createPrivateKey(input: KeyInput<KeyBytes, "pkcs8">): unknown;
  createPublicKey(input: KeyInput<KeyBytes, "spki"> | unknown): {
    export(options: { format: "der"; type: "spki" }): Bytes;
  };
  diffieHellman(options: { privateKey: unknown; publicKey: unknown }): Bytes;
}

function join(...parts: Bytes[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function bytes(value: Bytes) {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

type Aead = Pick<NoiseCrypto, "seal" | "open">;

function nodeAead(api: NodeStyleCryptoApi): Aead {
  const options = { authTagLength: TAG_LENGTH };
  return {
    seal(key, nonce, ad, plaintext) {
      const cipher = api.createCipheriv(AEAD_ALGORITHM, key, nonce, options);
      cipher.setAAD(ad, { plaintextLength: plaintext.length });
      const body = join(bytes(cipher.update(plaintext)), bytes(cipher.final()));
      return join(body, bytes(cipher.getAuthTag()));
    },
    open(key, nonce, ad, ciphertext) {
      if (ciphertext.length < TAG_LENGTH) {
        throw new Error("Ciphertext is shorter than its tag");
      }
      const bodyLength = ciphertext.length - TAG_LENGTH;
      const decipher = api.createDecipheriv(
        AEAD_ALGORITHM,
        key,
        nonce,
        options,
      );
      decipher.setAuthTag(ciphertext.subarray(bodyLength));
      decipher.setAAD(ad, { plaintextLength: bodyLength });
      return join(
        bytes(decipher.update(ciphertext.subarray(0, bodyLength))),
        bytes(decipher.final()),
      );
    },
  };
}

export function createNodeStyleCrypto<KeyBytes extends Bytes>(
  api: NodeStyleCryptoApi<KeyBytes>,
  toKeyBytes: (bytes: Bytes) => KeyBytes,
): NoiseCrypto {
  const aead: Aead = api.getCiphers().includes(AEAD_ALGORITHM)
    ? nodeAead(api)
    : nobleCrypto;
  const privateKey = (secretKey: Bytes) =>
    api.createPrivateKey({
      key: toKeyBytes(join(X25519_PKCS8_PREFIX, secretKey)),
      format: "der",
      type: "pkcs8",
    });
  const publicKeyObject = (publicKey: Bytes) =>
    api.createPublicKey({
      key: toKeyBytes(join(X25519_SPKI_PREFIX, publicKey)),
      format: "der",
      type: "spki",
    });
  return {
    randomSecretKey: () => bytes(api.randomBytes(KEY_LENGTH)),
    publicKey(secretKey) {
      const spki = api
        .createPublicKey(privateKey(secretKey))
        .export({ format: "der", type: "spki" });
      return bytes(spki).slice(-KEY_LENGTH);
    },
    dh(secretKey, publicKey) {
      const shared = bytes(
        api.diffieHellman({
          privateKey: privateKey(secretKey),
          publicKey: publicKeyObject(publicKey),
        }),
      );
      if (shared.every((byte) => byte === 0)) {
        throw new Error("X25519 produced an all-zero shared secret");
      }
      return shared;
    },
    seal: aead.seal,
    open: aead.open,
    sha256: (data) => bytes(api.createHash("sha256").update(data).digest()),
    hmacSha256: (key, data) =>
      bytes(api.createHmac("sha256", key).update(data).digest()),
  };
}
