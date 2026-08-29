import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleIssueCommand } from "./issue-commands";
import { handleNoteCommand } from "./note-commands";
import { parseArgs } from "./parse-args";
import { handleSearchCommand } from "./search-commands";

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
      columnId: "doing",
      title: "SQLite ownership",
      description: undefined,
      status: "doing",
      priority: undefined,
      workspaceId: null,
    });
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
