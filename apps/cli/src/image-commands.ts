import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, stringFlag } from "./parse-args";

export function imageUsageLines() {
  return [
    "  cocurdex image import <path.png|jpg|gif|webp> [--name <alt text>] [--json]   (prints markdown to embed in a note or issue)",
    "  cocurdex image locate <cocurdex://image/...> [--json]   (prints the local file path of an embedded image)",
  ];
}

export async function handleImageCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "import") {
    const [file] = args;
    if (!file) {
      throw new Error("Usage: cocurdex image import <path> [--name <alt>]");
    }
    const image = await withDaemon(() =>
      requestDaemon("image.import", {
        path: path.resolve(file),
        name: stringFlag(parsed, "name"),
      }),
    );
    printResult(image, parsed);
    return true;
  }

  if (action === "locate") {
    const [uri] = args;
    if (!uri) {
      throw new Error("Usage: cocurdex image locate <cocurdex://image/...>");
    }
    const image = await withDaemon(() =>
      requestDaemon("image.locate", { uri }),
    );
    if (!image) {
      throw new Error(`Image not found: ${uri}`);
    }
    printResult(image, parsed);
    return true;
  }

  return false;
}
