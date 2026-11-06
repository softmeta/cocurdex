import { requestDaemon } from "@cocurdex/daemon/client";
import {
  DEFAULT_VIEW_ID,
  ISSUE_DISPLAY_PROPERTIES,
  ISSUE_RELATION_KINDS,
  ISSUE_STATUS_CATEGORIES,
  type IssueActor,
  type IssueRelationKind,
  type IssueStatusCategory,
  isClosedStatusCategory,
  sortOrderForColumnPosition,
  type UpdateViewPayload,
  VIEW_GROUP_BY_FIELDS,
  VIEW_LAYOUTS,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  assertKnownFlags,
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import { readBodyFlag } from "./read-body";

const CLI_ACTOR: IssueActor = { kind: "cli" };

const BODY_FLAGS = ["body", "body-file"];

async function readIssueBody(parsed: ParsedArgs) {
  return (await readBodyFlag(parsed))?.trimEnd();
}
const FIELD_FLAGS = [
  "title",
  ...BODY_FLAGS,
  "status",
  "priority",
  "workspace",
  "parent",
  "labels",
];

const ISSUE_FLAGS: Record<string, readonly string[]> = {
  list: ["view", "status", "label", "parent", "open"],
  show: ["view", "detail"],
  create: ["view", ...FIELD_FLAGS],
  update: ["view", ...FIELD_FLAGS],
  move: ["view", "from"],
  delete: ["view"],
  comment: BODY_FLAGS,
  relate: [],
  unrelate: [],
  labels: [],
  label: ["name", "color"],
  statuses: [],
  status: ["name", "category", "color", "position"],
  views: [],
  view: ["title", "group-by", "layout", "show-empty", "properties"],
};

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

function enumFlag<T extends string>(
  parsed: ParsedArgs,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const value = stringFlag(parsed, name);
  if (value === undefined) {
    return undefined;
  }
  const match = allowed.find((entry) => entry === value);
  if (!match) {
    throw new Error(`--${name} must be one of: ${allowed.join(", ")}`);
  }
  return match;
}

function booleanFlag(parsed: ParsedArgs, name: string): boolean | undefined {
  const value = parsed.flags.get(name);
  if (value === undefined) {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`--${name} must be true or false`);
}

const VIEW_UPDATE_USAGE =
  "Usage: cocurdex issue view update <id> [--title <title>] [--group-by <field>] [--layout board|list] [--show-empty true|false] [--properties <a,b,...>]";

async function updateViewFromFlags(viewId: string, parsed: ParsedArgs) {
  const current = await withDaemon(() =>
    requestDaemon("issue.loadView", { viewId }),
  );
  if (!current) {
    throw new Error(`View not found: ${viewId}`);
  }
  const properties = listFlag(parsed, "properties");
  const unknown = properties?.filter(
    (entry) => !ISSUE_DISPLAY_PROPERTIES.some((known) => known === entry),
  );
  if (unknown && unknown.length > 0) {
    throw new Error(
      `--properties accepts: ${ISSUE_DISPLAY_PROPERTIES.join(", ")}`,
    );
  }
  const showEmpty = booleanFlag(parsed, "show-empty");
  const display =
    properties !== undefined || showEmpty !== undefined
      ? {
          properties: ISSUE_DISPLAY_PROPERTIES.filter((entry) =>
            (properties ?? current.view.display.properties).includes(entry),
          ),
          showEmptyGroups: showEmpty ?? current.view.display.showEmptyGroups,
        }
      : undefined;
  const payload: UpdateViewPayload = {
    viewId,
    title: stringFlag(parsed, "title"),
    groupBy: enumFlag(parsed, "group-by", VIEW_GROUP_BY_FIELDS),
    layout: enumFlag(parsed, "layout", VIEW_LAYOUTS),
    display,
  };
  const updated = await withDaemon(() =>
    requestDaemon("issue.updateView", payload),
  );
  return updated.view;
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

const STATUS_USAGE =
  "Usage: cocurdex issue status create --name <name> --category <category> [--color <color>] | status update <id|name> [--name <name>] [--category <category>] [--color <color>] | status move <id|name> --position <n> | status delete <id|name>";

function categoryFlag(parsed: ParsedArgs): IssueStatusCategory | undefined {
  const value = stringFlag(parsed, "category");
  if (value === undefined) {
    return undefined;
  }
  const category = ISSUE_STATUS_CATEGORIES.find((entry) => entry === value);
  if (!category) {
    throw new Error(
      `Unknown status category: ${value} (valid: ${ISSUE_STATUS_CATEGORIES.join(", ")})`,
    );
  }
  return category;
}

async function listStatuses() {
  return withDaemon(() =>
    requestDaemon("issue.listColumns", { field: "status" }),
  );
}

async function requireStatus(ref: string) {
  const statuses = await listStatuses();
  const needle = ref.toLowerCase();
  const status = statuses.find(
    (entry) => entry.id === ref || entry.title.toLowerCase() === needle,
  );
  if (!status) {
    throw new Error(`Issue status not found: ${ref}`);
  }
  return { status, statuses };
}

function positionFlag(parsed: ParsedArgs): number {
  const position = Number(getRequiredFlag(parsed, "position"));
  if (!Number.isInteger(position) || position < 0) {
    throw new Error("--position must be a non-negative integer");
  }
  return position;
}

const STATUS_ACTIONS: Record<
  string,
  (ref: string | undefined, parsed: ParsedArgs) => Promise<unknown>
> = {
  async create(_ref, parsed) {
    const category = categoryFlag(parsed);
    if (!category) {
      throw new Error(STATUS_USAGE);
    }
    return withDaemon(() =>
      requestDaemon("issue.createColumn", {
        field: "status",
        title: getRequiredFlag(parsed, "name"),
        category,
        color: stringFlag(parsed, "color") ?? null,
      }),
    );
  },
  async update(ref, parsed) {
    const { status } = await requireStatus(ref ?? "");
    return withDaemon(() =>
      requestDaemon("issue.updateColumn", {
        field: "status",
        id: status.id,
        title: stringFlag(parsed, "name"),
        category: categoryFlag(parsed),
        color: nullableFlag(parsed, "color"),
      }),
    );
  },
  async move(ref, parsed) {
    const { status, statuses } = await requireStatus(ref ?? "");
    const sortOrder = sortOrderForColumnPosition(
      statuses,
      status.id,
      positionFlag(parsed),
    );
    return withDaemon(() =>
      requestDaemon("issue.moveColumn", {
        field: "status",
        id: status.id,
        sortOrder,
      }),
    );
  },
  async delete(ref) {
    const { status } = await requireStatus(ref ?? "");
    await withDaemon(() =>
      requestDaemon("issue.deleteColumn", { field: "status", id: status.id }),
    );
    return { id: status.id, deleted: true };
  },
};

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
    const description = await readIssueBody(parsed);
    const issue = await withDaemon(() =>
      requestDaemon("issue.create", {
        viewId,
        title: getRequiredFlag(parsed, "title"),
        description,
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
    const description = await readIssueBody(parsed);
    const issue = await withDaemon(() =>
      requestDaemon("issue.update", {
        viewId,
        id: current.id,
        title: stringFlag(parsed, "title"),
        description,
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
      throw new Error(
        "Usage: cocurdex issue move <id> <column> [--from <column>]",
      );
    }
    const current = await requireIssue(id, viewId);
    const moved = await withDaemon(() =>
      requestDaemon("issue.move", {
        viewId,
        id: current.id,
        columnId,
        fromColumnId: stringFlag(parsed, "from"),
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
    const body = await readIssueBody(parsed);
    if (!body) {
      throw new Error(
        "Usage: cocurdex issue comment <id> --body <markdown>|--body-file <path>",
      );
    }
    const detail = await withDaemon(() =>
      requestDaemon("issue.comment", {
        id,
        body,
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
    if (operation === "update" && ref) {
      const label = await withDaemon(() =>
        requestDaemon("issue.updateLabel", {
          id: ref,
          name: stringFlag(parsed, "name"),
          color: stringFlag(parsed, "color"),
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
      "Usage: cocurdex issue label create --name <name> [--color <color>] | label update <id|name> [--name <name>] [--color <color>] | label delete <id|name>",
    );
  },
  async statuses(_args, parsed) {
    printRows(
      await listStatuses(),
      ["id", "title", "category", "color"],
      parsed,
    );
  },
  async status(args, parsed) {
    const [operation, ref] = args;
    const action =
      operation && Object.hasOwn(STATUS_ACTIONS, operation)
        ? STATUS_ACTIONS[operation]
        : undefined;
    if (!action || (operation !== "create" && !ref)) {
      throw new Error(STATUS_USAGE);
    }
    printResult(await action(ref, parsed), parsed);
  },
  async views(_args, parsed) {
    const views = await withDaemon(() => requestDaemon("issue.listViews"));
    printRows(views, ["id", "title", "groupBy", "layout"], parsed);
  },
  async view(args, parsed) {
    const [operation, ref] = args;
    if (operation !== "update" || !ref) {
      throw new Error(VIEW_UPDATE_USAGE);
    }
    printResult(await updateViewFromFlags(ref, parsed), parsed);
  },
};

export async function handleIssueCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (!action || !Object.hasOwn(ISSUE_ACTIONS, action)) {
    return false;
  }
  const handler = ISSUE_ACTIONS[action];
  assertKnownFlags(parsed, ISSUE_FLAGS[action] ?? [], `issue ${action}`);
  await handler(args, parsed, stringFlag(parsed, "view") ?? DEFAULT_VIEW_ID);
  return true;
}
