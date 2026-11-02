import {
  type MessageCompressor,
  type NoiseCrypto,
  nobleCrypto,
} from "@cocurdex/secure-channel";
import { requireOptionalNativeModule } from "expo";
import { getRandomBytes } from "expo-crypto";

const SECRET_KEY_BYTES = 32;

type Aead = Pick<NoiseCrypto, "seal" | "open">;

interface NativeWire extends Aead, MessageCompressor {
  readonly available: boolean;
}

const native = requireOptionalNativeModule<NativeWire>("CocurdexWire");

function platformAead(): Aead {
  if (!native?.available) return nobleCrypto;
  return {
    seal: (key, nonce, ad, plaintext) => native.seal(key, nonce, ad, plaintext),
    open: (key, nonce, ad, ciphertext) =>
      native.open(key, nonce, ad, ciphertext),
  };
}

const aead = platformAead();

export const mobileNoiseCrypto: NoiseCrypto = {
  ...nobleCrypto,
  seal: aead.seal,
  open: aead.open,
  randomSecretKey: () => getRandomBytes(SECRET_KEY_BYTES),
};

export const mobileMessageCompressor: MessageCompressor | undefined = native
  ? {
      deflateRaw: (data) => native.deflateRaw(data),
      inflateRaw: (data, maxLength) => native.inflateRaw(data, maxLength),
    }
  : undefined;
