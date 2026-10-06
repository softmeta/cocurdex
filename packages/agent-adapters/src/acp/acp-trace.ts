import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

export const ACP_TRACE_DIR_ENV = "COCURDEX_ACP_TRACE_DIR";

type Direction = "send" | "recv";

export function traceAcpStreams(
  input: WritableStream<Uint8Array>,
  output: ReadableStream<Uint8Array>,
  label: string,
  dir = process.env[ACP_TRACE_DIR_ENV],
) {
  if (!dir) {
    return { input, output };
  }
  mkdirSync(dir, { recursive: true });
  const file = createWriteStream(
    path.join(dir, `${path.basename(label)}-${Date.now()}.ndjson`),
    { flags: "a" },
  );
  const tap = (direction: Direction) => {
    const decoder = new TextDecoder();
    let pending = "";
    return new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            const at = new Date().toISOString();
            file.write(`${JSON.stringify({ at, direction, line })}\n`);
          }
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (direction === "recv") {
          file.end();
        }
      },
    });
  };
  const sent = tap("send");
  void sent.readable.pipeTo(input).catch(() => {});
  const received = output.pipeThrough(tap("recv"));
  return { input: sent.writable, output: received };
}
