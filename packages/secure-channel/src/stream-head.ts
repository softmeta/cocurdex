import type { MuxStream } from "./mux";

const HEAD_LENGTH_BYTES = 4;
export const MAX_STREAM_HEAD_LENGTH = 64 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export class StreamHeadError extends Error {
  override name = "StreamHeadError";
}

export function encodeStreamHead(value: unknown) {
  const json = textEncoder.encode(JSON.stringify(value));
  if (json.length > MAX_STREAM_HEAD_LENGTH) {
    throw new StreamHeadError("Stream head is too large");
  }
  const head = new Uint8Array(HEAD_LENGTH_BYTES + json.length);
  new DataView(head.buffer).setUint32(0, json.length);
  head.set(json, HEAD_LENGTH_BYTES);
  return head;
}

export function writeStreamHead(stream: MuxStream, value: unknown) {
  return stream.write(encodeStreamHead(value));
}

function concat(left: Uint8Array, right: Uint8Array) {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left);
  joined.set(right, left.length);
  return joined;
}

async function* remainder(
  first: Uint8Array,
  rest: AsyncIterator<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  if (first.length > 0) yield first;
  for (;;) {
    const next = await rest.next();
    if (next.done) return;
    yield next.value;
  }
}

export async function readStreamHead(chunks: AsyncIterator<Uint8Array>) {
  let buffered = new Uint8Array(0);
  let headLength: number | null = null;
  for (;;) {
    if (headLength === null && buffered.length >= HEAD_LENGTH_BYTES) {
      headLength = new DataView(
        buffered.buffer,
        buffered.byteOffset,
        buffered.byteLength,
      ).getUint32(0);
      if (headLength > MAX_STREAM_HEAD_LENGTH) {
        throw new StreamHeadError("Stream head is too large");
      }
    }
    const end = HEAD_LENGTH_BYTES + (headLength ?? 0);
    if (headLength !== null && buffered.length >= end) {
      let head: unknown;
      try {
        head = JSON.parse(
          textDecoder.decode(buffered.subarray(HEAD_LENGTH_BYTES, end)),
        );
      } catch {
        throw new StreamHeadError("Stream head is not JSON");
      }
      return { head, body: remainder(buffered.subarray(end), chunks) };
    }
    const next = await chunks.next();
    if (next.done) throw new StreamHeadError("Stream ended before its head");
    buffered = concat(buffered, next.value);
  }
}
