import { describe, expect, it, vi } from "vitest";
import { createRenderReadiness } from "@/components/render-readiness";

describe("createRenderReadiness", () => {
  it("is ready only after every hold is released", () => {
    const readiness = createRenderReadiness();
    const releaseCode = readiness.hold();
    const releaseDiagram = readiness.hold();

    releaseCode();
    expect(readiness.isReady()).toBe(false);

    releaseDiagram();
    expect(readiness.isReady()).toBe(true);
  });

  it("ignores a repeated release of the same hold", () => {
    const readiness = createRenderReadiness();
    const releaseFirst = readiness.hold();
    readiness.hold();

    releaseFirst();
    releaseFirst();

    expect(readiness.isReady()).toBe(false);
  });

  it("notifies only when readiness flips", () => {
    const readiness = createRenderReadiness();
    const listener = vi.fn();
    readiness.subscribe(listener);

    const releaseFirst = readiness.hold();
    const releaseSecond = readiness.hold();
    releaseFirst();
    expect(listener).toHaveBeenCalledTimes(1);

    releaseSecond();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
