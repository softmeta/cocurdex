import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type Brief,
  type InboxItem,
  isSupportedLocale,
  supportedLocales,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export function inboxUsageLines() {
  return [
    "  cocurdex inbox [list] [--json]",
    "  cocurdex inbox read <item-id> [--json]",
    "  cocurdex inbox brief [--tz <zone>] [--json]",
    "  cocurdex inbox brief post [--tz <zone>] [--locale en-US|zh-CN] [--json]",
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

function briefLines(brief: Brief) {
  const section = (title: string, lines: string[]) =>
    lines.length > 0 ? [`${title}:`, ...lines.map((line) => `  ${line}`)] : [];
  const itemLine = (item: InboxItem) =>
    item.detail ? `${item.title} - ${item.detail}` : item.title;
  return [
    `Brief for ${brief.day} (${brief.timeZone})`,
    ...section("Needs you", brief.needsYou.map(itemLine)),
    ...section(
      "Routine results",
      brief.results.map(
        (result) => `${result.routineName} - ${result.summary}`,
      ),
    ),
    ...section("Failures", brief.failures.map(itemLine)),
  ];
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
  if (action === "brief" && args[0] === "post") {
    const locale = stringFlag(parsed, "locale") ?? null;
    if (locale !== null && !isSupportedLocale(locale)) {
      throw new Error(
        `--locale must be one of: ${supportedLocales.join(", ")}`,
      );
    }
    const message = await withDaemon(() =>
      requestDaemon("inbox.postBrief", {
        timeZone: stringFlag(parsed, "tz"),
        locale,
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(message, parsed);
      return true;
    }
    console.log(
      message ? "Posted the brief to the assistant." : "Nothing new to post.",
    );
    return true;
  }
  if (action === "brief") {
    const brief = await withDaemon(() =>
      requestDaemon("inbox.brief", { timeZone: stringFlag(parsed, "tz") }),
    );
    if (parsed.flags.has("json")) {
      printResult(brief, parsed);
      return true;
    }
    console.log(
      brief ? briefLines(brief).join("\n") : "Nothing to brief today.",
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
