export const MESSAGE_COMPRESSION = "deflate-raw";
export type MessageCompression = typeof MESSAGE_COMPRESSION;

export interface MessageCompressor {
  deflateRaw(data: Uint8Array): Uint8Array;
  inflateRaw(data: Uint8Array, maxLength: number): Uint8Array;
}

export const MIN_COMPRESSED_MESSAGE_LENGTH = 1024;

const PLAIN = 0;
const DEFLATED = 1;

export class MessageCodecError extends Error {
  override name = "MessageCodecError";
}

function framed(kind: number, body: Uint8Array) {
  const bytes = new Uint8Array(body.length + 1);
  bytes[0] = kind;
  bytes.set(body, 1);
  return bytes;
}

export function encodeChannelMessage(
  message: Uint8Array,
  compressor: MessageCompressor,
) {
  if (message.length >= MIN_COMPRESSED_MESSAGE_LENGTH) {
    const deflated = compressor.deflateRaw(message);
    if (deflated.length < message.length) return framed(DEFLATED, deflated);
  }
  return framed(PLAIN, message);
}

export function decodeChannelMessage(
  bytes: Uint8Array,
  compressor: MessageCompressor,
  maxLength: number,
) {
  const body = bytes.subarray(1);
  if (bytes[0] === PLAIN) return body;
  if (bytes[0] !== DEFLATED) {
    throw new MessageCodecError("Unknown message encoding");
  }
  const inflated = compressor.inflateRaw(body, maxLength);
  if (inflated.length > maxLength) {
    throw new MessageCodecError("Message is too large");
  }
  return inflated;
}
