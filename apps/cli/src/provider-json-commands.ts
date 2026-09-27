import { readFile, writeFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { ProviderImportWarning } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult, stringFlag } from "./parse-args";
import { readStdin } from "./read-stdin";

const warningMessages: Record<ProviderImportWarning["code"], string> = {
  envApiKey:
    "API key references an environment variable; run `cocurdex provider key set` to store a key.",
  commandApiKey:
    "API key is a shell command; run `cocurdex provider key set` to store a key.",
  oauthIgnored:
    "OAuth settings are not imported; run `cocurdex provider login` instead.",
  authHeaderNoKey:
    "authHeader is set without an API key; run `cocurdex provider key set`.",
};

export async function handleProviderImport(
  source: string | undefined,
  parsed: ParsedArgs,
) {
  if (!source) {
    throw new Error("Usage: cocurdex provider import <file|->");
  }
  const json =
    source === "-" ? await readStdin() : await readFile(source, "utf8");
  const result = await withDaemon(() =>
    requestDaemon("provider.importJson", { json }),
  );
  if (parsed.flags.has("json")) {
    printResult(result, parsed);
    return;
  }
  console.log(
    `Imported ${result.providerIds.length} provider(s) and ${result.modelCount} model(s): ${result.providerIds.join(", ")}`,
  );
  for (const warning of result.warnings) {
    console.error(
      `warning: ${warning.providerId}: ${warningMessages[warning.code]}`,
    );
  }
}

export async function handleProviderExport(parsed: ParsedArgs) {
  const exported = await withDaemon(() => requestDaemon("provider.exportJson"));
  const json = `${JSON.stringify(exported, null, 2)}\n`;
  const output = stringFlag(parsed, "output");
  if (!output) {
    process.stdout.write(json);
    return;
  }
  await writeFile(output, json, { mode: 0o600 });
  console.log(
    `Exported ${Object.keys(exported.providers).length} provider(s) to ${output}`,
  );
}
