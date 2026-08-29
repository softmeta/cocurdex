import { requestDaemon } from "@cocurdex/daemon/client";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export async function handleIssueCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  const viewId = stringFlag(parsed, "view") ?? DEFAULT_VIEW_ID;

  if (action === "list") {
    const view = await withDaemon(() =>
      requestDaemon("issue.loadView", { viewId }),
    );
    const status = stringFlag(parsed, "status");
    const issues = (view?.issues ?? []).filter(
      (issue) => !status || issue.status === status,
    );
    printRows(issues, ["id", "status", "priority", "title"], parsed);
    return true;
  }

  if (action === "show") {
    const id = requiredId(args, "show");
    printResult(
      await withDaemon(() => requestDaemon("issue.get", { id, viewId })),
      parsed,
    );
    return true;
  }

  if (action === "create") {
    const columnId = stringFlag(parsed, "status") ?? "backlog";
    const issue = await withDaemon(() =>
      requestDaemon("issue.create", {
        viewId,
        columnId,
        title: getRequiredFlag(parsed, "title"),
        description: stringFlag(parsed, "body"),
        status: columnId,
        priority: stringFlag(parsed, "priority"),
        workspaceId: stringFlag(parsed, "workspace") ?? null,
      }),
    );
    printResult(issue, parsed);
    return true;
  }

  if (action === "move") {
    const [id, columnId] = args;
    if (!id || !columnId) {
      throw new Error("Usage: cocurdex issue move <id> <column>");
    }
    const current = await withDaemon(() =>
      requestDaemon("issue.get", { id, viewId }),
    );
    const moved = await withDaemon(() =>
      requestDaemon("issue.move", {
        viewId,
        id,
        columnId,
        sortOrder: current.sortOrder,
        expectedRevision: current.revision,
      }),
    );
    printResult(moved, parsed);
    return true;
  }

  if (action === "delete") {
    const id = requiredId(args, "delete");
    const current = await withDaemon(() =>
      requestDaemon("issue.get", { id, viewId }),
    );
    await withDaemon(() =>
      requestDaemon("issue.delete", {
        id,
        expectedRevision: current.revision,
      }),
    );
    printResult({ id, deleted: true }, parsed);
    return true;
  }

  if (action === "views") {
    const views = await withDaemon(() => requestDaemon("issue.listViews"));
    printRows(views, ["id", "title", "groupBy", "layout"], parsed);
    return true;
  }

  return false;
}

function requiredId(args: string[], action: string) {
  const [id] = args;
  if (!id) {
    throw new Error(`Usage: cocurdex issue ${action} <id>`);
  }
  return id;
}
