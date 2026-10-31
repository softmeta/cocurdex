export const FrameType = {
  open: 1,
  data: 2,
  end: 3,
  reset: 4,
  window: 5,
  ping: 6,
  pong: 7,
} as const;

export type FrameType = (typeof FrameType)[keyof typeof FrameType];

export const FRAME_FLAG_CONTINUES = 0x01;
export const MAX_FRAME_PAYLOAD_LENGTH = 64_000;
export const MAX_STREAM_ID = 0xffff_ffff;

const KNOWN_FLAGS = FRAME_FLAG_CONTINUES;
const FRAME_TYPES = new Set<number>(Object.values(FrameType));
const MAX_VARINT_BYTES = 5;

export interface Frame {
  readonly type: FrameType;
  readonly flags: number;
  readonly streamId: number;
  readonly payload: Uint8Array;
}

export class FrameError extends Error {
  override name = "FrameError";
}

function encodeVarint(value: number) {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

function decodeVarint(bytes: Uint8Array, offset: number) {
  let value = 0;
  let scale = 1;
  for (let index = 0; index < MAX_VARINT_BYTES; index += 1) {
    const byte = bytes[offset + index];
    if (byte === undefined) throw new FrameError("Truncated stream id");
    value += (byte & 0x7f) * scale;
    if ((byte & 0x80) === 0) {
      if (index > 0 && byte === 0) {
        throw new FrameError("Stream id is not minimally encoded");
      }
      return { value, next: offset + index + 1 };
    }
    scale *= 0x80;
  }
  throw new FrameError("Stream id is too long");
}

function assertStreamId(streamId: number) {
  if (!Number.isInteger(streamId) || streamId < 0 || streamId > MAX_STREAM_ID) {
    throw new FrameError(`Invalid stream id: ${streamId}`);
  }
}

export function encodeFrame(frame: Frame) {
  if (!FRAME_TYPES.has(frame.type)) {
    throw new FrameError(`Unknown frame type: ${frame.type}`);
  }
  if ((frame.flags & ~KNOWN_FLAGS) !== 0) {
    throw new FrameError(`Unknown frame flags: ${frame.flags}`);
  }
  assertStreamId(frame.streamId);
  if (frame.payload.length > MAX_FRAME_PAYLOAD_LENGTH) {
    throw new FrameError("Frame payload is too large");
  }
  const streamId = encodeVarint(frame.streamId);
  const bytes = new Uint8Array(2 + streamId.length + frame.payload.length);
  bytes[0] = frame.type;
  bytes[1] = frame.flags;
  bytes.set(streamId, 2);
  bytes.set(frame.payload, 2 + streamId.length);
  return bytes;
}

export function decodeFrame(bytes: Uint8Array): Frame {
  if (bytes.length < 3) throw new FrameError("Frame is too short");
  const type = bytes[0] as number;
  if (!FRAME_TYPES.has(type))
    throw new FrameError(`Unknown frame type: ${type}`);
  const flags = bytes[1] as number;
  if ((flags & ~KNOWN_FLAGS) !== 0) {
    throw new FrameError(`Unknown frame flags: ${flags}`);
  }
  const { value: streamId, next } = decodeVarint(bytes, 2);
  assertStreamId(streamId);
  const payload = bytes.subarray(next);
  if (payload.length > MAX_FRAME_PAYLOAD_LENGTH) {
    throw new FrameError("Frame payload is too large");
  }
  return { type: type as FrameType, flags, streamId, payload };
}
