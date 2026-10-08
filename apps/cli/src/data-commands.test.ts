import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleIssueCommand } from "./issue-commands";
import { handleNoteCommand } from "./note-commands";
import { parseArgs } from "./parse-args";
import { handleSearchCommand } from "./search-commands";
import { handleWorktreeCommand } from "./worktree-commands";

const requestMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/daemon/client", () => ({
  requestDaemon: requestMock,
}));

vi.mock("./daemon-command", () => ({
  withDaemon: (operation: () => Promise<unknown>) => operation(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("data commands", () => {
  it("lists notes through the daemon contract", async () => {
    requestMock.mockResolvedValue([]);
    const parsed = parseArgs(["--json"]);
    await handleNoteCommand("list", [], parsed);
    expect(requestMock).toHaveBeenCalledWith("note.list");
    expect(console.log).toHaveBeenCalledWith("[]");
  });

  it("lists managed worktrees through the daemon contract", async () => {
    requestMock.mockResolvedValue([]);
    const parsed = parseArgs(["--json"]);
    await handleWorktreeCommand("list", [], parsed);
    expect(requestMock).toHaveBeenCalledWith("worktree.list");
    expect(console.log).toHaveBeenCalledWith("[]");
  });

  it("creates issues with stable JSON output", async () => {
    requestMock.mockResolvedValue({
      id: "issue-id",
      title: "SQLite ownership",
    });
    const parsed = parseArgs([
      "--title",
      "SQLite ownership",
      "--status",
      "doing",
      "--json",
    ]);
    await handleIssueCommand("create", [], parsed);
    expect(requestMock).toHaveBeenCalledWith("issue.create", {
      viewId: "project",
      title: "SQLite ownership",
      description: undefined,
      status: "doing",
      priority: undefined,
      workspaceId: null,
      parentId: undefined,
      labelIds: undefined,
      actor: { kind: "cli" },
    });
  });

  it("updates an issue by identifier with its current revision", async () => {
    requestMock.mockImplementation(async (method: string) =>
      method === "issue.get"
        ? { id: "issue-id", revision: 3, sortOrder: 0 }
        : { id: "issue-id" },
    );
    await handleIssueCommand(
      "update",
      ["COC-7"],
      parseArgs([
        "--labels",
        "bug, agent",
        "--parent",
        "none",
        "--status",
        "review",
        "--json",
      ]),
    );
    expect(requestMock).toHaveBeenCalledWith("issue.get", {
      id: "COC-7",
      viewId: "project",
    });
    expect(requestMock).toHaveBeenCalledWith("issue.update", {
      viewId: "project",
      id: "issue-id",
      title: undefined,
      description: undefined,
      status: "review",
      priority: undefined,
      workspaceId: undefined,
      parentId: null,
      labelIds: ["bug", "agent"],
      expectedRevision: 3,
      actor: { kind: "cli" },
    });
  });

  it("rejects unknown relation kinds before calling the daemon", async () => {
    await expect(
      handleIssueCommand("relate", ["COC-1", "parent", "COC-2"], parseArgs([])),
    ).rejects.toThrow("blocks|related|duplicate");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("leaves unknown issue actions to the caller", async () => {
    expect(await handleIssueCommand("toString", [], parseArgs([]))).toBe(false);
  });

  it("searches notes and issues through one RPC", async () => {
    requestMock.mockResolvedValue([]);
    await handleSearchCommand(
      ["sqlite", "ownership"],
      parseArgs(["--kind", "note", "--json"]),
    );
    expect(requestMock).toHaveBeenCalledWith("search.documents", {
      query: "sqlite ownership",
      kinds: ["note"],
      workspaceId: undefined,
    });
  });
});
