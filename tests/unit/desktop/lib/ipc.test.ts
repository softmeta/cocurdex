import { describe, expect, it, vi } from "vitest";
import { desktopApi } from "@/lib";
import type { DesktopApi } from "@/lib/types";

describe("desktopApi", () => {
  it("exposes workspace and session methods", () => {
    expect(typeof desktopApi.listWorkspaces).toBe("function");
    expect(typeof desktopApi.listWorkspaceFiles).toBe("function");
    expect(typeof desktopApi.getWorkspaceGitDiff).toBe("function");
    expect(typeof desktopApi.getWorkspaceGitStatus).toBe("function");
    expect(typeof desktopApi.importImageAttachment).toBe("function");
    expect(typeof desktopApi.importDocumentAttachment).toBe("function");
    expect(typeof desktopApi.archiveSession).toBe("function");
    expect(typeof desktopApi.deleteSession).toBe("function");
    expect(typeof desktopApi.listProviderTemplates).toBe("function");
  });

  it("uses the preload bridge when it becomes available after module load", async () => {
    vi.resetModules();
    const originalDesktopApi = window.desktopApi;
    Reflect.deleteProperty(window, "desktopApi");

    const { desktopApi: loadedBeforeBridge } = await import("@/lib/ipc");
    const bridgeOpenExternal = vi.fn().mockResolvedValue(undefined);
    window.desktopApi = {
      openExternal: bridgeOpenExternal,
    } as unknown as DesktopApi;

    await loadedBeforeBridge.openExternal("https://example.com");
    expect(bridgeOpenExternal).toHaveBeenCalledWith("https://example.com");

    if (originalDesktopApi) {
      window.desktopApi = originalDesktopApi;
    } else {
      Reflect.deleteProperty(window, "desktopApi");
    }
  });
});
