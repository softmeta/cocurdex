import { afterEach, describe, expect, it, vi } from "vitest";
import { bindBrowserViewBounds } from "./browser-view-bounds";

afterEach(() => vi.useRealTimers());

function setup(hidden = false) {
  vi.useFakeTimers();
  const container = document.createElement("div");
  const workspace = document.createElement("div");
  workspace.setAttribute("aria-hidden", String(hidden));
  workspace.append(container);
  const rect = { left: 800, top: 100, width: 400, height: 600 };
  vi.spyOn(container, "getBoundingClientRect").mockImplementation(
    () => rect as DOMRect,
  );
  const bridge = {
    setBrowserBounds: vi.fn().mockResolvedValue(undefined),
    browserShow: vi.fn().mockResolvedValue(undefined),
  };
  const cleanup = bindBrowserViewBounds(container, bridge);
  return { rect, bridge, cleanup, workspace };
}

describe("native browser geometry", () => {
  it("hides when settings conceal the mounted workspace and restores on return", () => {
    const { bridge, cleanup, workspace } = setup();
    workspace.setAttribute("aria-hidden", "true");
    vi.advanceTimersToNextFrame();
    expect(bridge.browserShow).toHaveBeenLastCalledWith(false);
    workspace.setAttribute("aria-hidden", "false");
    vi.advanceTimersToNextFrame();
    expect(bridge.browserShow).toHaveBeenLastCalledWith(true);
    cleanup();
  });

  it("keeps a preview mounted behind settings hidden", () => {
    const { bridge, cleanup } = setup(true);
    expect(bridge.browserShow).toHaveBeenCalledWith(false);
    vi.advanceTimersToNextFrame();
    expect(bridge.browserShow).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("follows position changes even when the container size stays unchanged", () => {
    const { rect, bridge, cleanup } = setup();
    rect.left += 16;
    rect.top += 8;
    vi.advanceTimersToNextFrame();
    expect(bridge.setBrowserBounds).toHaveBeenLastCalledWith({
      x: 816,
      y: 108,
      w: 400,
      h: 600,
    });
    cleanup();
  });

  it("updates resized bounds without sending unchanged geometry every frame", () => {
    const { rect, bridge, cleanup } = setup();
    vi.advanceTimersToNextFrame();
    expect(bridge.setBrowserBounds).toHaveBeenCalledTimes(1);
    rect.width = 500;
    rect.height = 450;
    vi.advanceTimersToNextFrame();
    expect(bridge.setBrowserBounds).toHaveBeenLastCalledWith({
      x: 800,
      y: 100,
      w: 500,
      h: 450,
    });
    cleanup();
  });

  it("hides the native view and stops updates when its container unmounts", () => {
    const { rect, bridge, cleanup } = setup();
    expect(bridge.browserShow).toHaveBeenCalledWith(true);
    cleanup();
    rect.left = 100;
    vi.advanceTimersToNextFrame();
    expect(bridge.browserShow).toHaveBeenLastCalledWith(false);
    expect(bridge.setBrowserBounds).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
