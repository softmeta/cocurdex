import { requestDaemon } from "@cocurdex/daemon/client";
import {
  DEFAULT_VIEW_ID,
  ISSUE_RELATION_KINDS,
  type IssueActor,
  type IssueRelationKind,
  isClosedStatusCategory,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

const CLI_ACTOR: IssueActor = { kind: "cli" };

type IssueAction = (
  args: string[],
  parsed: ParsedArgs,
  viewId: string,
) => Promise<void>;

function listFlag(parsed: ParsedArgs, name: string): string[] | undefined {
  const value = parsed.flags.get(name);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function nullableFlag(parsed: ParsedArgs, name: string) {
  const value = parsed.flags.get(name);
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && value !== "none" ? value : null;
}

function requiredId(args: string[], usage: string) {
  const [id] = args;
  if (!id) {
    throw new Error(`Usage: cocurdex issue ${usage}`);
  }
  return id;
}

async function requireIssue(id: string, viewId: string) {
  const issue = await withDaemon(() =>
    requestDaemon("issue.get", { id, viewId }),
  );
  if (!issue) {
    throw new Error(`Issue not found: ${id}`);
  }
  return issue;
}

function parseRelation(args: string[], action: string) {
  const [id, kind, relatedId] = args;
  if (
    !id ||
    !relatedId ||
    !ISSUE_RELATION_KINDS.includes(kind as IssueRelationKind)
  ) {
    throw new Error(
      `Usage: cocurdex issue ${action} <id> ${ISSUE_RELATION_KINDS.join("|")} <id>`,
    );
  }
  return {
    id,
    kind: kind as IssueRelationKind,
    relatedId,
    actor: CLI_ACTOR,
  };
}

const ISSUE_ACTIONS: Record<string, IssueAction> = {
  async list(_args, parsed, viewId) {
    const view = await withDaemon(() =>
      requestDaemon("issue.loadView", { viewId }),
    );
    const status = stringFlag(parsed, "status");
    const labelRef = stringFlag(parsed, "label")?.toLowerCase();
    const label = view?.labels.find(
      (entry) => entry.id === labelRef || entry.name.toLowerCase() === labelRef,
    );
    const parentRef = stringFlag(parsed, "parent");
    const parent = parentRef ? await requireIssue(parentRef, viewId) : null;
    const openOnly = parsed.flags.has("open");
    const issues = (view?.issues ?? []).filter(
      (issue) =>
        (!status || issue.status === status) &&
        (!labelRef || (label && issue.labelIds.includes(label.id))) &&
        (!parent || issue.parentId === parent.id) &&
        (!openOnly || !isClosedStatusCategory(issue.statusCategory)),
    );
    printRows(
      issues,
      ["identifier", "id", "status", "priority", "title"],
      parsed,
    );
  },
  async show(args, parsed, viewId) {
    const id = requiredId(args, "show <id> [--detail]");
    if (parsed.flags.has("detail")) {
      const detail = await withDaemon(() =>
        requestDaemon("issue.getDetail", { id, viewId }),
      );
      if (!detail) {
        throw new Error(`Issue not found: ${id}`);
      }
      printResult(detail, parsed);
      return;
    }
    printResult(await requireIssue(id, viewId), parsed);
  },
  async create(_args, parsed, viewId) {
    const issue = await withDaemon(() =>
      requestDaemon("issue.create", {
        viewId,
        title: getRequiredFlag(parsed, "title"),
        description: stringFlag(parsed, "body"),
        status: stringFlag(parsed, "status"),
        priority: stringFlag(parsed, "priority"),
        workspaceId: stringFlag(parsed, "workspace") ?? null,
        parentId: stringFlag(parsed, "parent"),
        labelIds: listFlag(parsed, "labels"),
        actor: CLI_ACTOR,
      }),
    );
    printResult(issue, parsed);
  },
  async update(args, parsed, viewId) {
    const id = requiredId(args, "update <id> [fields]");
    const current = await requireIssue(id, viewId);
    const issue = await withDaemon(() =>
      requestDaemon("issue.update", {
        viewId,
        id: current.id,
        title: stringFlag(parsed, "title"),
        description: stringFlag(parsed, "body"),
        status: stringFlag(parsed, "status"),
        priority: stringFlag(parsed, "priority"),
        workspaceId: nullableFlag(parsed, "workspace"),
        parentId: nullableFlag(parsed, "parent"),
        labelIds: listFlag(parsed, "labels"),
        expectedRevision: current.revision,
        actor: CLI_ACTOR,
      }),
    );
    printResult(issue, parsed);
  },
  async move(args, parsed, viewId) {
    const [id, columnId] = args;
    if (!id || !columnId) {
      throw new Error("Usage: cocurdex issue move <id> <column>");
    }
    const current = await requireIssue(id, viewId);
    const moved = await withDaemon(() =>
      requestDaemon("issue.move", {
        viewId,
        id: current.id,
        columnId,
        sortOrder: current.sortOrder,
        expectedRevision: current.revision,
        actor: CLI_ACTOR,
      }),
    );
    printResult(moved, parsed);
  },
  async delete(args, parsed, viewId) {
    const id = requiredId(args, "delete <id>");
    const current = await requireIssue(id, viewId);
    await withDaemon(() =>
      requestDaemon("issue.delete", {
        id: current.id,
        expectedRevision: current.revision,
      }),
    );
    printResult({ id: current.id, deleted: true }, parsed);
  },
  async comment(args, parsed) {
    const id = requiredId(args, "comment <id> --body <markdown>");
    const detail = await withDaemon(() =>
      requestDaemon("issue.comment", {
        id,
        body: getRequiredFlag(parsed, "body"),
        actor: CLI_ACTOR,
      }),
    );
    printResult(detail.events.at(-1), parsed);
  },
  async relate(args, parsed) {
    const detail = await withDaemon(() =>
      requestDaemon("issue.addRelation", parseRelation(args, "relate")),
    );
    printResult(detail.relations, parsed);
  },
  async unrelate(args, parsed) {
    const detail = await withDaemon(() =>
      requestDaemon("issue.removeRelation", parseRelation(args, "unrelate")),
    );
    printResult(detail.relations, parsed);
  },
  async labels(_args, parsed) {
    const labels = await withDaemon(() => requestDaemon("issue.listLabels"));
    printRows(labels, ["id", "name", "color"], parsed);
  },
  async label(args, parsed) {
    const [operation, ref] = args;
    if (operation === "create") {
      const label = await withDaemon(() =>
        requestDaemon("issue.createLabel", {
          name: getRequiredFlag(parsed, "name"),
          color: stringFlag(parsed, "color") ?? null,
        }),
      );
      printResult(label, parsed);
      return;
    }
    if (operation === "delete" && ref) {
      await withDaemon(() => requestDaemon("issue.deleteLabel", { id: ref }));
      printResult({ id: ref, deleted: true }, parsed);
      return;
    }
    throw new Error(
      "Usage: cocurdex issue label create --name <name> [--color <color>] | label delete <id|name>",
    );
  },
  async views(_args, parsed) {
    const views = await withDaemon(() => requestDaemon("issue.listViews"));
    printRows(views, ["id", "title", "groupBy", "layout"], parsed);
  },
};

export async function handleIssueCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  const handler =
    action && Object.hasOwn(ISSUE_ACTIONS, action)
      ? ISSUE_ACTIONS[action]
      : undefined;
  if (!handler) {
    return false;
  }
  await handler(args, parsed, stringFlag(parsed, "view") ?? DEFAULT_VIEW_ID);
  return true;
}
