import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export function worktreeUsageLines() {
  return [
    "  cocurdex worktree list [--json]",
    "  cocurdex worktree settings [--root <path>] [--fetch|--no-fetch] [--json]",
    "  cocurdex worktree create --workspace <id|path> --branch <name> [--start-point <rev>] [--json]",
    "  cocurdex worktree remove --workspace <id|path> --path <worktree-path> [--json]",
  ];
}

export async function handleWorktreeCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list" || action === undefined) {
    const worktrees = await withDaemon(() => requestDaemon("worktree.list"));
    printRows(
      worktrees.map((worktree) => ({
        workspace: worktree.workspaceName,
        branch: worktree.branch ?? "(detached)",
        path: worktree.path,
        sessions: worktree.sessions.length,
      })),
      ["workspace", "branch", "path", "sessions"],
      parsed,
    );
    return true;
  }

  if (action === "settings") {
    const current = await withDaemon(() =>
      requestDaemon("worktree.settings.get"),
    );
    const root = stringFlag(parsed, "root");
    const fetchFlag = parsed.flags.get("fetch");
    const noFetch = parsed.flags.get("no-fetch") === true;
    if (root === undefined && fetchFlag === undefined && !noFetch) {
      printResult(current, parsed);
      return true;
    }
    let fetchBeforeCreate = current.fetchBeforeCreate;
    if (noFetch) {
      fetchBeforeCreate = false;
    } else if (fetchFlag !== undefined) {
      fetchBeforeCreate = true;
    }
    const saved = await withDaemon(() =>
      requestDaemon("worktree.settings.save", {
        rootPath: root === undefined ? current.rootPath : root || null,
        fetchBeforeCreate,
      }),
    );
    printResult(saved, parsed);
    return true;
  }

  if (action === "create") {
    const workspaceValue = getRequiredFlag(parsed, "workspace");
    const branch = getRequiredFlag(parsed, "branch");
    const workspaceId = await resolveWorkspaceId(workspaceValue);
    const created = await withDaemon(() =>
      requestDaemon("worktree.create", {
        workspaceId,
        branch,
        startPoint: stringFlag(parsed, "start-point"),
      }),
    );
    printResult(created, parsed);
    return true;
  }

  if (action === "remove") {
    const workspaceValue = getRequiredFlag(parsed, "workspace");
    const worktreePath = stringFlag(parsed, "path") ?? args[0];
    if (!worktreePath) {
      throw new Error(
        "Usage: cocurdex worktree remove --workspace <id|path> --path <worktree-path>",
      );
    }
    const workspaceId = await resolveWorkspaceId(workspaceValue);
    const removed = await withDaemon(() =>
      requestDaemon("worktree.remove", { workspaceId, worktreePath }),
    );
    printResult(removed, parsed);
    return true;
  }

  return false;
}

async function resolveWorkspaceId(workspaceValue: string) {
  const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
  const workspace = workspaces.find(
    (item) =>
      item.id === workspaceValue || item.rootPaths.includes(workspaceValue),
  );
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceValue}`);
  }
  return workspace.id;
}
