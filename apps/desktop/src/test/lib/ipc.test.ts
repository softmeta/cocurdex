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
    expect(typeof desktopApi.readImageAttachmentDataUrl).toBe("function");
    expect(typeof desktopApi.createSession).toBe("function");
    expect(typeof desktopApi.archiveSession).toBe("function");
    expect(typeof desktopApi.deleteSession).toBe("function");
    expect(typeof desktopApi.listProviderTemplates).toBe("function");
    expect(typeof desktopApi.sendMessage).toBe("function");
    expect(typeof desktopApi.submitPreviousMessage).toBe("function");
    expect(typeof desktopApi.getPreviousMessageCheckpointStatus).toBe(
      "function",
    );
    expect(typeof desktopApi.stopSession).toBe("function");
    expect(typeof desktopApi.onAgentEvent).toBe("function");
    expect(typeof desktopApi.readPdfData).toBe("function");
  });

  it("readPdfData fallback resolves to a string", async () => {
    const result = await desktopApi.readPdfData({
      filePath: "/workspace/doc.pdf",
    });
    expect(typeof result).toBe("string");
  });

  it("uses the preload bridge when it becomes available after module load", async () => {
    vi.resetModules();
    const originalDesktopApi = window.desktopApi;
    Reflect.deleteProperty(window, "desktopApi");

    const { desktopApi: loadedBeforeBridge } = await import("@/lib/ipc");
    const bridgeReadPdfData = vi.fn().mockResolvedValue("pdf-asset://doc.pdf");
    window.desktopApi = {
      readPdfData: bridgeReadPdfData,
    } as unknown as DesktopApi;

    await expect(
      loadedBeforeBridge.readPdfData({
        filePath: "/workspace/doc.pdf",
      }),
    ).resolves.toEqual("pdf-asset://doc.pdf");
    expect(bridgeReadPdfData).toHaveBeenCalledWith({
      filePath: "/workspace/doc.pdf",
    });

    if (originalDesktopApi) {
      window.desktopApi = originalDesktopApi;
    } else {
      Reflect.deleteProperty(window, "desktopApi");
    }
  });
});
