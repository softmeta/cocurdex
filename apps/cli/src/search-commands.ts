import { requestDaemon } from "@cocurdex/daemon/client";
import type { SearchDocumentKind } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, stringFlag } from "./parse-args";

export async function handleSearchCommand(
  args: string[],
  parsed: ParsedArgs,
): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    throw new Error("Usage: cocurdex search <query>");
  }
  const kindFlag = stringFlag(parsed, "kind");
  if (kindFlag && kindFlag !== "note" && kindFlag !== "issue") {
    throw new Error("--kind must be note or issue");
  }
  const kind = kindFlag as SearchDocumentKind | undefined;
  const results = await withDaemon(() =>
    requestDaemon("search.documents", {
      query,
      kinds: kind ? [kind] : undefined,
      workspaceId: stringFlag(parsed, "workspace"),
    }),
  );
  printResult(results, parsed);
}
