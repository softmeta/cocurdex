import { readDaemonMetadata } from "@cocurdex/daemon/client";
import { buildLocalWebClientUrl } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";

export const webUsageLines = () => [
  "  cocurdex web [--json]                   Print the local web client URL",
];

async function servesWebClient(url: string) {
  try {
    const response = await fetch(new URL("/", url), { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function handleWebCommand(parsed: ParsedArgs) {
  const metadata = await withDaemon(() => readDaemonMetadata());
  const url = buildLocalWebClientUrl(metadata.webSocketUrl, metadata.token);
  if (!(await servesWebClient(url))) {
    throw new Error(
      "The running daemon does not serve the web client. Start Cocurdex from the desktop app, then retry.",
    );
  }
  if (parsed.flags.has("json")) {
    console.log(JSON.stringify({ url }, null, 2));
    return;
  }
  console.log(url);
}
