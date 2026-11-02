import { type NoiseCrypto, nobleCrypto } from "@cocurdex/secure-channel";
import { requireOptionalNativeModule } from "expo";
import { getRandomBytes } from "expo-crypto";

const SECRET_KEY_BYTES = 32;

type Aead = Pick<NoiseCrypto, "seal" | "open">;

interface NativeAead extends Aead {
  readonly available: boolean;
}

function platformAead(): Aead {
  const native = requireOptionalNativeModule<NativeAead>("CocurdexAead");
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
