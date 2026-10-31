import { type CipherState, TAG_LENGTH } from "./cipher-state";

export const MAX_NOISE_MESSAGE_LENGTH = 65_535;
export const MAX_TRANSPORT_PLAINTEXT_LENGTH =
  MAX_NOISE_MESSAGE_LENGTH - TAG_LENGTH;
export const DEFAULT_REKEY_INTERVAL = 65_536;

const EMPTY = new Uint8Array(0);

export interface SecureTransport {
  readonly handshakeHash: Uint8Array;
  encrypt(plaintext: Uint8Array): Uint8Array;
  decrypt(ciphertext: Uint8Array): Uint8Array;
}

export interface SecureTransportOptions {
  send: CipherState;
  receive: CipherState;
  handshakeHash: Uint8Array;
  rekeyInterval?: number;
}

function rekeyingDirection(cipher: CipherState, interval: number) {
  let messages = 0;
  return (operate: () => Uint8Array) => {
    const result = operate();
    messages += 1;
    if (messages % interval === 0) cipher.rekey();
    return result;
  };
}

export function createSecureTransport(
  options: SecureTransportOptions,
): SecureTransport {
  const interval = options.rekeyInterval ?? DEFAULT_REKEY_INTERVAL;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error("Rekey interval must be a positive integer");
  }
  const sending = rekeyingDirection(options.send, interval);
  const receiving = rekeyingDirection(options.receive, interval);
  return {
    handshakeHash: options.handshakeHash,
    encrypt(plaintext) {
      if (plaintext.length > MAX_TRANSPORT_PLAINTEXT_LENGTH) {
        throw new Error("Transport message is too large");
      }
      return sending(() => options.send.encryptWithAd(EMPTY, plaintext));
    },
    decrypt(ciphertext) {
      if (ciphertext.length > MAX_NOISE_MESSAGE_LENGTH) {
        throw new Error("Transport message is too large");
      }
      return receiving(() => options.receive.decryptWithAd(EMPTY, ciphertext));
    },
  };
}
