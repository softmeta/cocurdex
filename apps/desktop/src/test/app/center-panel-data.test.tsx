import type { WorkspaceRecord } from "@cocurdex/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const desktopApiMock = vi.hoisted(() => ({
  listGitBranches: vi.fn(),
  onWorkspaceGitStateChanged: vi.fn(),
}));

vi.mock("@/features/agent", async () => {
  const { atom } = await import("jotai");
  return {
    loadSessionMessagesAtom: atom(null),
    loadSessionToolCallsAtom: atom(null),
    loadTurnStatsAtom: atom(null),
    messagesLoadedBySessionAtom: atom({}),
    toolCallsLoadedBySessionAtom: atom({}),
  };
});

vi.mock("@/features/workspaces", async () => {
  const { atom } = await import("jotai");
  return {
    activeBranchAtom: atom<string | null>(null),
    activeBranchesAtom: atom<
      Array<{
        name: string;
        current: boolean;
        kind: "local" | "remote" | "detached";
      }>
    >([]),
  };
});

vi.mock("@/lib", () => ({
  desktopApi: desktopApiMock,
  markSessionSwitch: vi.fn(),
  measureSessionSwitch: vi.fn(),
}));

import { useGitBranches } from "@/app/layout/center-panel-data";
import { activeBranchAtom, activeBranchesAtom } from "@/features/workspaces";

function wrapStore(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGitBranches", () => {
  it("reloads the active workspace branches after external git changes", async () => {
    const store = createStore();
    const workspace = { rootPath: "/repo" } as WorkspaceRecord;
    let gitStateListener: ((event: { rootPath: string }) => void) | undefined;

    desktopApiMock.onWorkspaceGitStateChanged.mockImplementation((listener) => {
      gitStateListener = listener;
      return vi.fn();
    });
    desktopApiMock.listGitBranches
      .mockResolvedValueOnce([{ name: "main", current: true, kind: "local" }])
      .mockResolvedValueOnce([
        { name: "feature/new", current: true, kind: "local" },
        { name: "main", current: false, kind: "local" },
      ]);

    renderHook(() => useGitBranches(workspace), {
      wrapper: wrapStore(store),
    });

    await waitFor(() => {
      expect(store.get(activeBranchAtom)).toBe("main");
    });
    expect(desktopApiMock.onWorkspaceGitStateChanged).toHaveBeenCalledOnce();

    await act(async () => {
      gitStateListener?.({ rootPath: "/other-repo" });
      gitStateListener?.({ rootPath: "/repo" });
    });

    await waitFor(() => {
      expect(store.get(activeBranchAtom)).toBe("feature/new");
    });
    expect(desktopApiMock.listGitBranches).toHaveBeenCalledTimes(2);
    expect(store.get(activeBranchesAtom).map((branch) => branch.name)).toEqual([
      "feature/new",
      "main",
    ]);
  });
});
