import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function frameFileName(index, ms) {
  return `${String(index).padStart(4, "0")}-${String(Math.max(0, Math.round(ms))).padStart(6, "0")}ms.jpg`;
}

export async function startScreencast(
  client,
  { dir, quality = 70, maxWidth = 1280, maxHeight = 1280 },
) {
  await mkdir(dir, { recursive: true });
  const startedAt = Date.now();
  const frames = [];
  const writes = [];
  const off = client.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    client.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const capturedAt = metadata?.timestamp ? metadata.timestamp * 1000 : Date.now();
    const ms = capturedAt - startedAt;
    const file = frameFileName(frames.length, ms);
    frames.push({ file, ms: Math.round(ms) });
    writes.push(writeFile(path.join(dir, file), Buffer.from(data, "base64")));
  });
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth,
    maxHeight,
    everyNthFrame: 1,
  });
  return {
    async stop() {
      try {
        await client.send("Page.stopScreencast");
      } finally {
        off();
      }
      await Promise.all(writes);
      await writeFile(
        path.join(dir, "frames.json"),
        `${JSON.stringify({ startedAt, frames }, null, 2)}\n`,
      );
      return { dir, frames };
    },
  };
}
