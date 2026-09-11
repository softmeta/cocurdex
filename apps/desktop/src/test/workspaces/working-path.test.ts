import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { bindFocusedPaneContentAtom } from "@/features/sessions/session-split/session-split-store";
import { sessionsAtom } from "@/features/sessions/session-store";
import { activeWorkingPathAtom } from "@/features/workspaces/working-path";
import {
  activeWorkspaceIdAtom,
  draftWorktreePathAtom,
  workspacesAtom,
} from "@/features/workspaces/workspace-store";

const workspace: WorkspaceRecord = {
  id: "workspace-1",
  name: "project",
  rootPath: "/Users/me/project",
  createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z",
  lastOpenedAt: "2026-09-07T00:00:00.000Z",
  sortOrder: 1000,
};

function session(worktreePath?: string | null): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Session",
    agentType: "claude-agent",
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    lastMessageAt: null,
    worktreePath,
  };
}

describe("activeWorkingPathAtom", () => {
  it("uses the workspace root for a new session draft", () => {
    const store = createStore();
    store.set(workspacesAtom, [workspace]);
    store.set(activeWorkspaceIdAtom, "workspace-1");

    expect(store.get(activeWorkingPathAtom)).toBe("/Users/me/project");
  });

  it("uses the draft worktree before a session starts", () => {
    const store = createStore();
    store.set(workspacesAtom, [workspace]);
    store.set(activeWorkspaceIdAtom, "workspace-1");
    store.set(draftWorktreePathAtom, "/tmp/worktrees/feature");

    expect(store.get(activeWorkingPathAtom)).toBe("/tmp/worktrees/feature");
  });

  it("uses the bound session worktree over the draft", () => {
    const store = createStore();
    store.set(workspacesAtom, [workspace]);
    store.set(activeWorkspaceIdAtom, "workspace-1");
    store.set(draftWorktreePathAtom, "/tmp/worktrees/draft");
    store.set(sessionsAtom, [session("/tmp/worktrees/session")]);
    store.set(bindFocusedPaneContentAtom, {
      sessionId: "session-1",
      conversationId: null,
    });

    expect(store.get(activeWorkingPathAtom)).toBe("/tmp/worktrees/session");
  });

  it("uses the session workspace even when another project is selected", () => {
    const otherWorkspace: WorkspaceRecord = {
      ...workspace,
      id: "workspace-2",
      name: "other",
      rootPath: "/Users/me/other",
    };
    const store = createStore();
    store.set(workspacesAtom, [workspace, otherWorkspace]);
    store.set(activeWorkspaceIdAtom, "workspace-2");
    store.set(sessionsAtom, [session("/tmp/worktrees/session")]);
    store.set(bindFocusedPaneContentAtom, {
      sessionId: "session-1",
      conversationId: null,
    });

    expect(store.get(activeWorkingPathAtom)).toBe("/tmp/worktrees/session");
  });
});
