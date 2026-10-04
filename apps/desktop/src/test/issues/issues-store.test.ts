import type { ViewFull, ViewSummary } from "@cocurdex/shared";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const issuesIpcMock = vi.hoisted(() => ({
  load: vi.fn(),
  listViews: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  moveIssue: vi.fn(),
  updateView: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/features/issues/issues-ipc", () => ({
  issuesIpc: issuesIpcMock,
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  activeViewAtom,
  loadIssuesAtom,
  moveIssueAtom,
  updateIssueAtom,
} from "@/features/issues/issues-store";

const now = "2026-07-25T00:00:00.000Z";
const summary: ViewSummary = {
  id: "project",
  title: "Project view",
  icon: null,
  groupBy: "status",
  layout: "board",
  filters: [],
  revision: 1,
};
const full: ViewFull = {
  view: { ...summary, createdAt: now, updatedAt: now },
  columns: [
    {
      id: "backlog",
      field: "status",
      title: "Backlog",
      color: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
  ],
  statusOptions: [{ id: "backlog", title: "Backlog" }],
  priorityOptions: [{ id: "none", title: "No priority" }],
  issues: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  issuesIpcMock.listViews.mockResolvedValue([summary]);
  issuesIpcMock.load.mockResolvedValue(full);
});

describe("SQLite-backed issues store", () => {
  it("loads the default view without a filesystem root", async () => {
    const store = createStore();
    await store.set(loadIssuesAtom);
    expect(store.get(activeViewAtom)?.view.id).toBe("project");
    expect(issuesIpcMock.listViews).toHaveBeenCalledWith();
    expect(issuesIpcMock.load).toHaveBeenCalledWith({ viewId: "project" });
  });

  it("rolls back an optimistic move when the daemon rejects it", async () => {
    const issue = {
      id: "issue-1",
      columnId: "backlog",
      viewId: "project",
      title: "Card",
      description: null,
      color: null,
      status: "backlog",
      priority: "none",
      workspaceId: null,
      assigneeSessionId: null,
      sortOrder: 0,
      revision: 2,
      createdAt: now,
      updatedAt: now,
    };
    issuesIpcMock.load.mockResolvedValue({ ...full, issues: [issue] });
    issuesIpcMock.moveIssue.mockRejectedValue(new Error("Issue was modified"));
    const store = createStore();
    await store.set(loadIssuesAtom);

    const result = await store.set(moveIssueAtom, {
      id: "issue-1",
      columnId: "doing",
      sortOrder: 5,
    });

    expect(result).toBeNull();
    expect(store.get(activeViewAtom)?.issues[0]?.columnId).toBe("backlog");
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it("saves dialog edits against the revision the dialog opened with", async () => {
    issuesIpcMock.updateIssue.mockResolvedValue({ id: "issue-1" });
    const store = createStore();
    await store.set(loadIssuesAtom);

    await store.set(updateIssueAtom, {
      id: "issue-1",
      expectedRevision: 4,
      title: "Renamed",
    });

    expect(issuesIpcMock.updateIssue).toHaveBeenCalledWith({
      viewId: "project",
      id: "issue-1",
      title: "Renamed",
      expectedRevision: 4,
    });
  });
});
