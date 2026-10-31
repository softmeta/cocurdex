import {
  decodeFrame,
  encodeFrame,
  FRAME_FLAG_CONTINUES,
  FrameError,
  FrameType,
  MAX_FRAME_PAYLOAD_LENGTH,
} from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";

describe("frame codec", () => {
  it.each([0, 1, 127, 128, 16_383, 16_384, 0xffff_ffff])(
    "round-trips stream id %i",
    (streamId) => {
      const frame = {
        type: FrameType.data,
        flags: FRAME_FLAG_CONTINUES,
        streamId,
        payload: Uint8Array.of(1, 2, 3),
      };
      expect(decodeFrame(encodeFrame(frame))).toEqual(frame);
    },
  );

  it("keeps a full-size frame within one Noise message", () => {
    const encoded = encodeFrame({
      type: FrameType.data,
      flags: 0,
      streamId: 0xffff_ffff,
      payload: new Uint8Array(MAX_FRAME_PAYLOAD_LENGTH),
    });
    expect(encoded.length).toBeLessThanOrEqual(65_519);
  });

  it.each([
    ["too short", Uint8Array.of(2, 0)],
    ["unknown type", Uint8Array.of(99, 0, 0)],
    ["unknown flags", Uint8Array.of(2, 0x80, 0)],
    ["truncated stream id", Uint8Array.of(2, 0, 0x80)],
    [
      "over-long stream id",
      Uint8Array.of(2, 0, 0x80, 0x80, 0x80, 0x80, 0x80, 1),
    ],
    ["non-minimal stream id", Uint8Array.of(2, 0, 0x81, 0x00)],
    [
      "stream id above 32 bits",
      Uint8Array.of(2, 0, 0xff, 0xff, 0xff, 0xff, 0x7f),
    ],
  ])("rejects a frame with %s", (_label, bytes) => {
    expect(() => decodeFrame(bytes)).toThrow(FrameError);
  });

  it("refuses to encode an oversized payload", () => {
    expect(() =>
      encodeFrame({
        type: FrameType.data,
        flags: 0,
        streamId: 2,
        payload: new Uint8Array(MAX_FRAME_PAYLOAD_LENGTH + 1),
      }),
    ).toThrow(FrameError);
  });
});
