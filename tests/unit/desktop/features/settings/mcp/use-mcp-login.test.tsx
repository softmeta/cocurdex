import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const desktopApiMock = vi.hoisted(() => ({
  startMcpLogin: vi.fn(),
  waitMcpLogin: vi.fn(),
  cancelMcpLogin: vi.fn(),
  openExternal: vi.fn(),
  logoutMcpServer: vi.fn(),
}));

vi.mock("@/lib", async () => ({
  desktopApi: desktopApiMock,
  useMountEffect: (await import("@/lib/react-hooks")).useMountEffect,
}));

import { useMcpLogin } from "@/features/settings/mcp/use-mcp-login";

function deferredStart() {
  let resolve: (value: { loginId: string; authUrl: string }) => void = () => {};
  desktopApiMock.startMcpLogin.mockReturnValue(
    new Promise((settle) => {
      resolve = settle;
    }),
  );
  return () =>
    resolve({ loginId: "login-1", authUrl: "https://example.invalid/auth" });
}

beforeEach(() => {
  vi.clearAllMocks();
  desktopApiMock.cancelMcpLogin.mockResolvedValue(undefined);
  desktopApiMock.waitMcpLogin.mockReturnValue(new Promise(() => {}));
});

describe("useMcpLogin", () => {
  it("cancels a login that finishes starting after unmount", async () => {
    const finishStart = deferredStart();
    const { result, unmount } = renderHook(() =>
      useMcpLogin({ name: "linear", onSignedIn: vi.fn() }),
    );

    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    unmount();
    finishStart();
    await started;

    expect(desktopApiMock.openExternal).not.toHaveBeenCalled();
    expect(desktopApiMock.cancelMcpLogin).toHaveBeenCalledWith("login-1");
  });

  it("cancels a login that finishes starting after the user cancels", async () => {
    const finishStart = deferredStart();
    const { result } = renderHook(() =>
      useMcpLogin({ name: "linear", onSignedIn: vi.fn() }),
    );

    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    act(() => result.current.cancel());
    await act(async () => {
      finishStart();
      await started;
    });

    expect(result.current.state).toEqual({ phase: "idle" });
    expect(desktopApiMock.openExternal).not.toHaveBeenCalled();
    expect(desktopApiMock.cancelMcpLogin).toHaveBeenCalledWith("login-1");
  });
});
