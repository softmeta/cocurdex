import { describe, expect, it, vi } from "vitest";
import { createBrowserPreviewStream } from "./browser-preview-stream";

describe("browser preview stream", () => {
  it("coalesces pending documents and keeps the final document on the same URL", async () => {
    let resolveOpen!: (url: string) => void;
    const open = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const update = vi.fn().mockResolvedValue(true);
    const stream = createBrowserPreviewStream({
      open,
      update,
      onError: vi.fn(),
    });
    stream.push("first");
    stream.push("second");
    stream.push("final");
    expect(open).toHaveBeenCalledTimes(1);
    resolveOpen("preview-url");
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "preview-url",
        "final",
        false,
        "final",
      ),
    );
    expect(update).toHaveBeenCalledTimes(1);
    stream.push("final");
    expect(update).toHaveBeenCalledTimes(1);
    stream.stop();
  });

  it("stops after navigation or disposal", async () => {
    const open = vi.fn().mockResolvedValue("preview-url");
    const update = vi.fn().mockResolvedValue(false);
    const stream = createBrowserPreviewStream({
      open,
      update,
      onError: vi.fn(),
    });
    stream.push("first");
    await Promise.resolve();
    stream.push("second");
    await Promise.resolve();
    stream.push("third");
    expect(update).toHaveBeenCalledTimes(1);
    stream.stop();
    stream.push("fourth");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
