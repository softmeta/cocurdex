import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceFilesCache,
  useWorkspaceFiles,
} from "@/features/workspaces/file-search/use-workspace-files";

const desktopApiMock = vi.hoisted(() => ({
  listWorkspaceFiles: vi.fn(),
  onWorkspaceFilesChanged: vi.fn(),
}));

vi.mock("../../lib/ipc", () => ({
  desktopApi: desktopApiMock,
}));

describe("useWorkspaceFiles", () => {
  beforeEach(() => {
    invalidateWorkspaceFilesCache();
    desktopApiMock.listWorkspaceFiles.mockReset();
    desktopApiMock.onWorkspaceFilesChanged.mockReset();
  });

  it("keeps stale files visible when a background refresh fails", async () => {
    let onFilesChanged: ((event: { rootPath: string }) => void) | undefined;
    desktopApiMock.onWorkspaceFilesChanged.mockImplementation((listener) => {
      onFilesChanged = listener;
      return () => {};
    });
    desktopApiMock.listWorkspaceFiles.mockResolvedValueOnce([
      { path: "src/index.ts", type: "file" },
    ]);

    const { result } = renderHook(() => useWorkspaceFiles("/repo"));
    await waitFor(() => expect(result.current.status).toBe("idle"));

    desktopApiMock.listWorkspaceFiles.mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    act(() => onFilesChanged?.({ rootPath: "/repo" }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.files).toEqual([
      { path: "src/index.ts", type: "file" },
    ]);

    let resolveSuperseded: ((files: unknown[]) => void) | undefined;
    desktopApiMock.listWorkspaceFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSuperseded = resolve;
          }),
      )
      .mockResolvedValueOnce([{ path: "src/current.ts", type: "file" }]);

    act(() => onFilesChanged?.({ rootPath: "/repo" }));
    act(() => onFilesChanged?.({ rootPath: "/repo" }));
    await waitFor(() =>
      expect(result.current.files).toEqual([
        { path: "src/current.ts", type: "file" },
      ]),
    );

    await act(async () => {
      resolveSuperseded?.([{ path: "src/obsolete.ts", type: "file" }]);
    });
    expect(result.current.files).toEqual([
      { path: "src/current.ts", type: "file" },
    ]);
  });
});
