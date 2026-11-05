import { requestDaemon } from "@cocurdex/daemon/client";
import type { InboxItem } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult, printRows } from "./parse-args";

export function inboxUsageLines() {
  return [
    "  cocurdex inbox [list] [--json]",
    "  cocurdex inbox read <item-id> [--json]",
  ];
}

function inboxRow(item: InboxItem) {
  return {
    id: item.id,
    kind: item.kind,
    form: item.form,
    title: item.title,
    detail: item.detail ?? "",
    at: item.at,
  };
}

export async function handleInboxCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list" || action === undefined) {
    const items = await withDaemon(() => requestDaemon("inbox.list"));
    if (parsed.flags.has("json")) {
      printResult(items, parsed);
      return true;
    }
    printRows(
      items.map(inboxRow),
      ["kind", "form", "title", "detail", "at", "id"],
      parsed,
    );
    return true;
  }
  if (action === "read") {
    const id = args[0];
    if (!id) throw new Error("Usage: cocurdex inbox read <item-id>");
    await withDaemon(() => requestDaemon("inbox.read", { id }));
    printResult({ read: id }, parsed);
    return true;
  }
  return false;
}
