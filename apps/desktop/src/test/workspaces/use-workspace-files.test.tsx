import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    invalidateWorkspaceFilesCache();
    desktopApiMock.listWorkspaceFiles.mockReset();
    desktopApiMock.onWorkspaceFilesChanged.mockReset();
  });

  afterEach(() => {
    invalidateWorkspaceFilesCache();
    vi.useRealTimers();
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
  });

  it("does not immediately retry a failed listing", async () => {
    let onFilesChanged: ((event: { rootPath: string }) => void) | undefined;
    desktopApiMock.onWorkspaceFilesChanged.mockImplementation((listener) => {
      onFilesChanged = listener;
      return () => {};
    });
    desktopApiMock.listWorkspaceFiles.mockRejectedValue(
      new Error("temporary failure"),
    );

    renderHook(() => useWorkspaceFiles("/repo"));
    await waitFor(() =>
      expect(desktopApiMock.listWorkspaceFiles).toHaveBeenCalledTimes(1),
    );

    act(() => onFilesChanged?.({ rootPath: "/repo" }));
    expect(desktopApiMock.listWorkspaceFiles).toHaveBeenCalledTimes(1);

    desktopApiMock.listWorkspaceFiles.mockResolvedValueOnce([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await waitFor(() =>
      expect(desktopApiMock.listWorkspaceFiles).toHaveBeenCalledTimes(2),
    );
  });

  it("advances backoff once when several consumers share a failed listing", async () => {
    desktopApiMock.listWorkspaceFiles.mockRejectedValue(
      new Error("temporary failure"),
    );

    renderHook(() => useWorkspaceFiles("/repo"));
    renderHook(() => useWorkspaceFiles("/repo"));
    renderHook(() => useWorkspaceFiles("/repo"));
    await waitFor(() =>
      expect(desktopApiMock.listWorkspaceFiles).toHaveBeenCalledTimes(1),
    );

    desktopApiMock.listWorkspaceFiles.mockResolvedValueOnce([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await waitFor(() =>
      expect(desktopApiMock.listWorkspaceFiles).toHaveBeenCalledTimes(2),
    );
  });
});
