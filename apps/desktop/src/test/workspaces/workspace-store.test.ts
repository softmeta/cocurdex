import type { WorkspaceRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeWorkspaceIdAtom,
  addWorkspaceAtom,
  bootstrapWorkspacesAtom,
  collapsedWorkspaceIdsAtom,
  openWorkspaceByPathAtom,
  selectWorkspaceAtom,
  workspacesAtom,
} from "@/features/workspaces";

const saveWorkspace = vi.fn<(workspace: WorkspaceRecord) => Promise<void>>();

function makeWorkspace(id: string, lastOpenedAt: string): WorkspaceRecord {
  return {
    id,
    name: id,
    rootPath: `/ws/${id}`,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    lastOpenedAt,
  };
}

beforeEach(() => {
  saveWorkspace.mockReset();
  saveWorkspace.mockResolvedValue(undefined);
  // The IPC layer reads window.desktopApi at call time; inject a spyable stub.
  (window as unknown as { desktopApi: unknown }).desktopApi = { saveWorkspace };
});

afterEach(() => {
  (window as unknown as { desktopApi?: unknown }).desktopApi = undefined;
});

describe("workspace activation persistence", () => {
  it("stamps a fresh lastOpenedAt and persists when selecting a workspace", () => {
    const store = createStore();
    const a = makeWorkspace("a", "2024-01-01T00:00:00.000Z");
    const b = makeWorkspace("b", "2024-01-02T00:00:00.000Z");
    store.set(workspacesAtom, [a, b]);

    store.set(selectWorkspaceAtom, "a");

    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    const saved = saveWorkspace.mock.calls[0][0];
    expect(saved.id).toBe("a");
    expect(saved.lastOpenedAt > a.lastOpenedAt).toBe(true);
  });

  it("persists the workspace that just became active on add", () => {
    const store = createStore();

    store.set(addWorkspaceAtom, makeWorkspace("a", "2024-01-01T00:00:00.000Z"));

    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    expect(saveWorkspace.mock.calls[0][0].id).toBe("a");
  });

  it("persists the first workspace that bootstrap activates", () => {
    const store = createStore();

    store.set(bootstrapWorkspacesAtom, [
      makeWorkspace("a", "2024-01-01T00:00:00.000Z"),
      makeWorkspace("b", "2024-01-02T00:00:00.000Z"),
    ]);

    // sorted by lastOpenedAt desc → "b" becomes active.
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    expect(saveWorkspace.mock.calls[0][0].id).toBe("b");
  });

  it("does not persist when bootstrapping an empty list", () => {
    const store = createStore();

    store.set(bootstrapWorkspacesAtom, []);

    expect(saveWorkspace).not.toHaveBeenCalled();
  });

  it("does not persist when selecting an unknown workspace id", () => {
    const store = createStore();
    store.set(workspacesAtom, [makeWorkspace("a", "2024-01-01T00:00:00.000Z")]);

    store.set(selectWorkspaceAtom, "missing");

    expect(saveWorkspace).not.toHaveBeenCalled();
  });
});

describe("openWorkspaceByPathAtom", () => {
  it("selects an existing workspace with the same rootPath", () => {
    const store = createStore();
    const existing = makeWorkspace("a", "2024-01-01T00:00:00.000Z");
    store.set(workspacesAtom, [existing]);

    const result = store.set(openWorkspaceByPathAtom, "/ws/a");

    expect(result.workspace.id).toBe("a");
    expect(result.didSwitchProject).toBe(true);
    expect(store.get(activeWorkspaceIdAtom)).toBe("a");
    expect(store.get(workspacesAtom)).toHaveLength(1);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });

  it("creates a workspace when the path is new", () => {
    const store = createStore();

    const result = store.set(openWorkspaceByPathAtom, "/tmp/new-project");

    expect(result.workspace.rootPath).toBe("/tmp/new-project");
    expect(result.workspace.name).toBe("new-project");
    expect(result.didSwitchProject).toBe(true);
    expect(store.get(activeWorkspaceIdAtom)).toBe(result.workspace.id);
    expect(store.get(workspacesAtom)).toHaveLength(1);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });

  it("treats trailing slashes as the same path", () => {
    const store = createStore();
    const existing = makeWorkspace("a", "2024-01-01T00:00:00.000Z");
    store.set(workspacesAtom, [existing]);

    const result = store.set(openWorkspaceByPathAtom, "/ws/a/");

    expect(result.workspace.id).toBe("a");
    expect(store.get(workspacesAtom)).toHaveLength(1);
  });

  it("promotes the opened project to the top and expands its session list", () => {
    const store = createStore();
    const a = makeWorkspace("a", "2024-01-01T00:00:00.000Z");
    const b = makeWorkspace("b", "2024-01-02T00:00:00.000Z");
    store.set(workspacesAtom, [a, b]);
    store.set(activeWorkspaceIdAtom, "a");
    store.set(collapsedWorkspaceIdsAtom, ["b"]);

    const result = store.set(openWorkspaceByPathAtom, "/ws/b");

    expect(result.didSwitchProject).toBe(true);
    expect(store.get(activeWorkspaceIdAtom)).toBe("b");
    expect(store.get(workspacesAtom).map((w) => w.id)).toEqual(["b", "a"]);
    expect(store.get(collapsedWorkspaceIdsAtom)).toEqual([]);
  });

  it("reports didSwitchProject false when reopening the active project", () => {
    const store = createStore();
    const a = makeWorkspace("a", "2024-01-01T00:00:00.000Z");
    store.set(workspacesAtom, [a]);
    store.set(activeWorkspaceIdAtom, "a");

    const result = store.set(openWorkspaceByPathAtom, "/ws/a");

    expect(result.didSwitchProject).toBe(false);
    expect(store.get(activeWorkspaceIdAtom)).toBe("a");
  });
});
