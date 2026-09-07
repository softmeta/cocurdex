import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  addAnnotationAtom,
  annotationsAtom,
  browserErrorAtom,
  browserTitleAtom,
  isAnnotationModeAtom,
  receiveBrowserTabsAtom,
} from "./browser-store";

const tabs = [
  { id: "a", url: "https://a.test", title: "A", error: null, loading: false },
  {
    id: "b",
    url: "https://b.test",
    title: "B",
    error: "Offline",
    loading: false,
  },
];

describe("per-tab browser state", () => {
  it("keeps annotation state with its tab across activation", () => {
    const store = createStore();
    store.set(receiveBrowserTabsAtom, { tabs, activeId: "a" });
    store.set(isAnnotationModeAtom, true);
    const annotation = {
      id: "capture",
      type: "region" as const,
      boundingBox: { x: 0, y: 0, width: 1, height: 1 },
      pageUrl: tabs[0].url,
      capturedAt: new Date().toISOString(),
    };
    store.set(receiveBrowserTabsAtom, { tabs, activeId: "b" });
    store.set(addAnnotationAtom, annotation, "a");
    expect(store.get(annotationsAtom)).toEqual([]);
    expect(store.get(isAnnotationModeAtom)).toBe(false);
    expect(store.get(browserErrorAtom)).toBe("Offline");
    store.set(receiveBrowserTabsAtom, { tabs, activeId: "a" });
    expect(store.get(annotationsAtom)).toEqual([annotation]);
    expect(store.get(isAnnotationModeAtom)).toBe(true);
    expect(store.get(browserTitleAtom)).toBe("A");
    expect(store.get(browserErrorAtom)).toBeNull();
  });

  it("discards state belonging to closed tabs", () => {
    const store = createStore();
    store.set(receiveBrowserTabsAtom, { tabs, activeId: "a" });
    store.set(isAnnotationModeAtom, true);
    store.set(receiveBrowserTabsAtom, { tabs: [tabs[1]], activeId: "b" });
    store.set(receiveBrowserTabsAtom, { tabs, activeId: "a" });
    expect(store.get(isAnnotationModeAtom)).toBe(false);
  });
});
