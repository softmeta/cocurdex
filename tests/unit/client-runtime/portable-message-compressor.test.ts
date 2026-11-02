import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  InflatedMessageTooLargeError,
  portableMessageCompressor,
} from "@cocurdex/client-runtime/internal/portable-message-compressor";
import { describe, expect, it } from "vitest";

const text = new TextEncoder().encode(
  JSON.stringify({ type: "daemon.event", delta: "token ".repeat(4000) }),
);

describe("portableMessageCompressor", () => {
  it("speaks the same raw deflate as the daemon", () => {
    const deflated = portableMessageCompressor.deflateRaw(text);
    expect(deflated.length).toBeLessThan(text.length / 10);
    expect(new Uint8Array(inflateRawSync(deflated))).toEqual(text);
    expect(
      portableMessageCompressor.inflateRaw(deflateRawSync(text), text.length),
    ).toEqual(text);
  });

  it("stops inflating past the message limit", () => {
    const bomb = deflateRawSync(new Uint8Array(4 * 1024 * 1024));
    expect(() => portableMessageCompressor.inflateRaw(bomb, 64 * 1024)).toThrow(
      InflatedMessageTooLargeError,
    );
  });
});
