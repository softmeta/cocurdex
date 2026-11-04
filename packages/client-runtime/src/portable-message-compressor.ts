import type { MessageCompressor } from "@cocurdex/secure-channel";
import { deflateSync, Inflate } from "fflate";

const INFLATE_SLICE_BYTES = 1024;

export class InflatedMessageTooLargeError extends Error {
  constructor(maxLength: number) {
    super(`Inflated message exceeds ${maxLength} bytes`);
    this.name = "InflatedMessageTooLargeError";
  }
}

function inflateRaw(data: Uint8Array, maxLength: number) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const inflater = new Inflate((chunk) => {
    length += chunk.length;
    if (length > maxLength) throw new InflatedMessageTooLargeError(maxLength);
    chunks.push(chunk);
  });
  for (let offset = 0; offset < data.length; offset += INFLATE_SLICE_BYTES) {
    const end = offset + INFLATE_SLICE_BYTES;
    inflater.push(data.subarray(offset, end), end >= data.length);
  }
  if (data.length === 0) inflater.push(data, true);
  const inflated = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    inflated.set(chunk, position);
    position += chunk.length;
  }
  return inflated;
}

export const portableMessageCompressor: MessageCompressor = {
  deflateRaw: (data) => deflateSync(data, { level: 1 }),
  inflateRaw,
};
