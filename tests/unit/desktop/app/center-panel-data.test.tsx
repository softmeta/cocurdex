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
    gitBranchesByRootAtom: atom({}),
    activeWorktreesAtom: atom<
      Array<{
        path: string;
        head: string;
        branch: string | null;
        detached: boolean;
        locked: boolean;
        prunable: boolean;
        bare: boolean;
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
    const workspace = { rootPaths: ["/repo"] } as WorkspaceRecord;
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

    const { result } = renderHook(
      () => useGitBranches(workspace.rootPaths[0]),
      {
        wrapper: wrapStore(store),
      },
    );

    await waitFor(() => {
      expect(result.current.activeBranch).toBe("main");
    });
    expect(desktopApiMock.onWorkspaceGitStateChanged).toHaveBeenCalledOnce();

    await act(async () => {
      gitStateListener?.({ rootPath: "/other-repo" });
      gitStateListener?.({ rootPath: "/repo" });
    });

    await waitFor(() => {
      expect(result.current.activeBranch).toBe("feature/new");
    });
    expect(desktopApiMock.listGitBranches).toHaveBeenCalledTimes(2);
    expect(result.current.activeBranches.map((branch) => branch.name)).toEqual([
      "feature/new",
      "main",
    ]);
  });

  it("never shows the previous workspace branch while another loads", async () => {
    const store = createStore();
    desktopApiMock.onWorkspaceGitStateChanged.mockReturnValue(vi.fn());
    let resolveOther: (value: unknown) => void = () => {};
    desktopApiMock.listGitBranches
      .mockResolvedValueOnce([{ name: "main", current: true, kind: "local" }])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOther = resolve;
        }),
      )
      .mockResolvedValueOnce([{ name: "main", current: true, kind: "local" }]);

    const { result, rerender } = renderHook(
      ({ rootPath }) => useGitBranches(rootPath),
      { initialProps: { rootPath: "/repo" }, wrapper: wrapStore(store) },
    );
    await waitFor(() => {
      expect(result.current.activeBranch).toBe("main");
    });

    rerender({ rootPath: "/other-repo" });
    expect(result.current.activeBranch).toBeUndefined();

    await act(async () => {
      resolveOther([{ name: "dev", current: true, kind: "local" }]);
    });
    expect(result.current.activeBranch).toBe("dev");

    rerender({ rootPath: "/repo" });
    expect(result.current.activeBranch).toBe("main");
  });
});
