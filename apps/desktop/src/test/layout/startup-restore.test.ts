import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  activeWorkspaceIdAtom,
  bootstrapWorkspacesAtom,
  workspacesAtom,
} from "@/features/workspaces";

describe("startup restoration", () => {
  it("sets the most recently opened workspace as active", () => {
    const store = createStore();

    store.set(bootstrapWorkspacesAtom, [
      {
        id: "w1",
        name: "older",
        rootPath: "/tmp/older",
        createdAt: "2026-04-20T09:00:00.000Z",
        updatedAt: "2026-04-20T09:00:00.000Z",
        lastOpenedAt: "2026-04-20T09:00:00.000Z",
        sortOrder: 1000,
      },
      {
        id: "w2",
        name: "newer",
        rootPath: "/tmp/newer",
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z",
        lastOpenedAt: "2026-04-20T10:00:00.000Z",
        sortOrder: 2000,
      },
    ]);

    expect(store.get(activeWorkspaceIdAtom)).toBe("w2");
    expect(store.get(workspacesAtom).map((workspace) => workspace.id)).toEqual([
      "w1",
      "w2",
    ]);
  });
});
