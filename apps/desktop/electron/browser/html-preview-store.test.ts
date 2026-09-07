import { describe, expect, it } from "vitest";
import { HtmlPreviewStore } from "./html-preview-store";

describe("HTML browser previews", () => {
  it("retains independent snapshots for reload and history navigation", () => {
    const store = new HtmlPreviewStore();
    const first = store.add("<h1>First</h1>");
    const second = store.add("<h1>Second</h1>");
    expect(first).not.toBe(second);
    expect(store.read(`${first}#heading`)).toBe("<h1>First</h1>");
    expect(store.read(second)).toBe("<h1>Second</h1>");
    expect(store.read("file:///etc/passwd")).toBeUndefined();
    expect(store.read(`${first}/../../etc/passwd`)).toBeUndefined();
  });

  it("preserves open previews at capacity and releases capacity when closed", () => {
    const store = new HtmlPreviewStore();
    const first = store.add("old");
    let latest = first;
    for (let index = 0; index < 31; index += 1) {
      latest = store.add(String(index));
    }
    expect(() => store.add("overflow")).toThrow("Close a browser preview");
    expect(store.read(first)).toBe("old");
    expect(store.read(latest)).toBe("30");
    store.remove(first);
    expect(store.read(store.add("new"))).toBe("new");
    expect(() => store.add("x".repeat(17 * 1024 * 1024))).toThrow("too large");
  });
});
