import { afterEach, describe, expect, it, vi } from "vitest";
import { bindCodeTail } from "./code-tail";

afterEach(() => vi.useRealTimers());

describe("streamed code tail", () => {
  it("follows content changes and highlighter replacements even after a scroll event", async () => {
    vi.useFakeTimers();
    const container = document.createElement("section");
    let height = 1000;
    Object.defineProperty(container, "scrollHeight", { get: () => height });
    const pre = document.createElement("pre");
    pre.textContent = "First";
    container.append(pre);
    const dispose = bindCodeTail(container);
    vi.advanceTimersToNextFrame();
    expect(container.scrollTop).toBe(1000);
    container.scrollTop = 0;
    container.dispatchEvent(new Event("scroll"));
    height = 1500;
    pre.textContent = "More code";
    await Promise.resolve();
    vi.advanceTimersToNextFrame();
    expect(container.scrollTop).toBe(1500);
    height = 2000;
    container.innerHTML = "<pre><code>Final highlighted code</code></pre>";
    await Promise.resolve();
    vi.advanceTimersToNextFrame();
    expect(container.scrollTop).toBe(2000);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("follows completed content when its container is mounted again", async () => {
    vi.useFakeTimers();
    const container = document.createElement("section");
    Object.defineProperty(container, "scrollHeight", { value: 1000 });
    const dispose = bindCodeTail(container);
    container.textContent = "Highlighted history";
    await Promise.resolve();
    vi.advanceTimersToNextFrame();
    expect(container.scrollTop).toBe(1000);
    dispose();
  });
});
