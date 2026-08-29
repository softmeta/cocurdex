import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPdfPageThumbnail } from "@/features/pdf-reader/renderer/pdf-page-thumbnail";

function makeFakePdf(numPages: number, viewport = { width: 200, height: 300 }) {
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
  const cleanup = vi.fn();
  const getPage = vi.fn().mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({
      width: viewport.width * scale,
      height: viewport.height * scale,
    }),
    render,
    cleanup,
  });
  return {
    pdf: { numPages, getPage } as never,
    getPage,
    render,
    cleanup,
  };
}

describe("renderPdfPageThumbnail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects out-of-range pages without touching getPage", async () => {
    const { pdf, getPage } = makeFakePdf(3);
    expect(await renderPdfPageThumbnail(pdf, 0)).toBeNull();
    expect(await renderPdfPageThumbnail(pdf, 4)).toBeNull();
    expect(getPage).not.toHaveBeenCalled();
  });

  it("renders a scaled canvas and returns a data URL", async () => {
    const { pdf, getPage, render, cleanup } = makeFakePdf(2, {
      width: 400,
      height: 200,
    });

    // jsdom's canvas 2d context is missing; stub the minimum the helper needs.
    const toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,abc");
    const getContext = vi.fn().mockReturnValue({});
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext,
          toDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    }) as typeof document.createElement);

    const result = await renderPdfPageThumbnail(pdf, 1, 100);

    expect(getPage).toHaveBeenCalledWith(1);
    expect(getContext).toHaveBeenCalledWith("2d");
    expect(render).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
    // Longest edge is width 400 → scale 100/400 = 0.25 → canvas 100×50.
    const renderArg = render.mock.calls[0]?.[0] as {
      canvas: { width: number; height: number };
      viewport: { width: number; height: number };
    };
    expect(renderArg.canvas.width).toBe(100);
    expect(renderArg.canvas.height).toBe(50);
    expect(result).toBe("data:image/jpeg;base64,abc");
  });
});
