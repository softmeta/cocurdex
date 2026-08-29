import type { ViewFull, ViewSummary } from "@cocurdex/shared";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const issuesIpcMock = vi.hoisted(() => ({
  load: vi.fn(),
  listViews: vi.fn(),
  createColumn: vi.fn(),
  createIssue: vi.fn(),
  updateView: vi.fn(),
}));

vi.mock("@/features/issues/issues-ipc", () => ({
  issuesIpc: issuesIpcMock,
}));

import { activeViewAtom, loadIssuesAtom } from "@/features/issues/issues-store";

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
      viewId: "project",
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
});
