import { type NoiseCrypto, nobleCrypto } from "@cocurdex/secure-channel";
import { getRandomBytes } from "expo-crypto";

const SECRET_KEY_BYTES = 32;

export const mobileNoiseCrypto: NoiseCrypto = {
  ...nobleCrypto,
  randomSecretKey: () => getRandomBytes(SECRET_KEY_BYTES),
};
