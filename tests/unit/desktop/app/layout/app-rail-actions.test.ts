import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeAppAtom,
  peekAppViewAtom,
  selectRailItemAtom,
} from "@/app/layout/app-rail";
import { rightPanelResolvedActiveViewAtom } from "@/app/layout/right-editor-panel-store";
import { sidebarTabAtom } from "@/app/layout/sidebar/sidebar-tab-store";
import { openFileAtom } from "@/features/editor/editor-store";

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  });
});

describe("app rail actions", () => {
  it("shows the picked app over a file reveal still pending in work", () => {
    const store = createStore();
    store.set(sidebarTabAtom, "workspaces");
    store.set(openFileAtom, "/workspace/readme.md");
    store.set(selectRailItemAtom, "issues");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("issues");
    store.set(openFileAtom, "/workspace/next.md");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("editor");
  });

  it("peeks an entity beside a work session without entering the app", () => {
    const store = createStore();
    store.set(sidebarTabAtom, "workspaces");
    store.set(peekAppViewAtom, "notes");
    expect(store.get(activeAppAtom)).toBeNull();
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("notes");
    store.set(selectRailItemAtom, "notes");
    store.set(peekAppViewAtom, "issues");
    expect(store.get(activeAppAtom)).toBe("issues");
  });
});
