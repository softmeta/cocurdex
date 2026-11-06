import { readFile } from "node:fs/promises";
import { type ParsedArgs, stringFlag } from "./parse-args";
import { readStdin } from "./read-stdin";

export async function readBodyFlag(
  parsed: ParsedArgs,
): Promise<string | undefined> {
  const bodyFile = stringFlag(parsed, "body-file");
  if (bodyFile) {
    return readFile(bodyFile, "utf8");
  }
  const body = stringFlag(parsed, "body");
  return body === "-" ? readStdin() : body;
}
