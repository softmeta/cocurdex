import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { EnvHttpProxyAgent, fetch } from "undici";

const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export function proxiedFetch(url: string, init: { signal: AbortSignal }) {
  return fetch(url, { ...init, dispatcher: new EnvHttpProxyAgent() });
}

export async function downloadVerified(
  url: string,
  destination: string,
  expected: { sha256: string | null; size?: number },
) {
  const response = await proxiedFetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (expected.size !== undefined && bytes > expected.size) {
          callback(new Error(`Download is larger than expected: ${url}`));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(destination),
  );
  if (expected.size !== undefined && bytes !== expected.size) {
    throw new Error(`Download size mismatch for ${url}`);
  }
  if (expected.sha256 && hash.digest("hex") !== expected.sha256) {
    throw new Error(`Checksum mismatch for ${url}`);
  }
}
