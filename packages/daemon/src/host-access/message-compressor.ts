import { constants, deflateRawSync, inflateRawSync } from "node:zlib";
import type { MessageCompressor } from "@cocurdex/secure-channel";
import type { RemoteMessageCompression } from "@cocurdex/shared";

const DEFLATE_RAW: RemoteMessageCompression = "deflate-raw";

export const nodeMessageCompressor: MessageCompressor = {
  deflateRaw: (data) => deflateRawSync(data, { level: constants.Z_BEST_SPEED }),
  inflateRaw: (data, maxLength) =>
    inflateRawSync(data, { maxOutputLength: Math.max(maxLength, 1) }),
};

export function negotiatedCompression(
  payload: unknown,
): RemoteMessageCompression | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const offered = (payload as { compression?: unknown }).compression;
  return Array.isArray(offered) && offered.includes(DEFLATE_RAW)
    ? DEFLATE_RAW
    : undefined;
}
