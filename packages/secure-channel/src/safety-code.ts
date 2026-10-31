import { type NoiseCrypto, nobleCrypto } from "./noise-crypto";

const SAFETY_CODE_DIGITS = 6;
const SAFETY_CODE_MODULUS = 10 ** SAFETY_CODE_DIGITS;

export function pairingSafetyCode(
  hostKey: Uint8Array,
  deviceKey: Uint8Array,
  crypto: NoiseCrypto = nobleCrypto,
): string {
  const joined = new Uint8Array(hostKey.length + deviceKey.length);
  joined.set(hostKey);
  joined.set(deviceKey, hostKey.length);
  const digest = crypto.sha256(joined);
  const value = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength,
  ).getUint32(0);
  return String(value % SAFETY_CODE_MODULUS).padStart(SAFETY_CODE_DIGITS, "0");
}
