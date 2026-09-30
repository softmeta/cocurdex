import { atom, createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeFileAtom, openFilesAtom } from "@/features/editor/editor-store";
import { activeSessionIdAtom } from "@/features/sessions";
import { activeWorkspaceIdAtom } from "@/features/workspaces";
import { startEditorContextSync } from "./editor-context-sync";

const host = vi.hoisted(() => ({
  saveEditorView: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib", () => ({ desktopApi: host }));
vi.mock("@/features/editor", () => import("@/features/editor/editor-store"));
vi.mock("@/features/sessions", async () => {
  const { atom } = await import("jotai");
  return { activeSessionIdAtom: atom<string | null>(null) };
});
vi.mock("@/features/workspaces", async () => {
  const { atom } = await import("jotai");
  return { activeWorkspaceIdAtom: atom<string | null>(null) };
});
vi.mock("../right-editor-panel-store", async () => {
  const { atom } = await import("jotai");
  return { freezeRightPanelViewAtom: atom(null, () => {}) };
});

type Store = ReturnType<typeof createStore>;

const enterAtom = atom(
  null,
  (_get, set, workspaceId: string | null, sessionId: string | null) => {
    set(activeWorkspaceIdAtom, workspaceId);
    set(activeSessionIdAtom as typeof activeWorkspaceIdAtom, sessionId);
  },
);

const setTabsAtom = atom(
  null,
  (_get, set, openFiles: string[], activeFile: string | null) => {
    set(openFilesAtom, openFiles);
    set(activeFileAtom, activeFile);
  },
);

function enter(
  store: Store,
  workspaceId: string | null,
  sessionId: string | null,
) {
  store.set(enterAtom, workspaceId, sessionId);
}

function setEditorTabs(
  store: Store,
  openFiles: string[],
  activeFile: string | null,
) {
  store.set(setTabsAtom, openFiles, activeFile);
}

function tabs(store: Store) {
  return {
    openFiles: store.get(openFilesAtom),
    activeFile: store.get(activeFileAtom),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("editor tabs across session and workspace switches", () => {
  it("keeps each workspace's draft tabs when switching between workspaces", () => {
    const store = createStore();
    const stop = startEditorContextSync(store);

    enter(store, "a", null);
    setEditorTabs(store, ["/a/one.ts"], "/a/one.ts");
    enter(store, "b", null);
    expect(tabs(store)).toEqual({ openFiles: [], activeFile: null });

    setEditorTabs(store, ["/b/two.ts"], "/b/two.ts");
    enter(store, "a", null);
    expect(tabs(store)).toEqual({
      openFiles: ["/a/one.ts"],
      activeFile: "/a/one.ts",
    });
    stop();
  });

  it("persists a session's tabs and restores them when it is reopened", () => {
    const store = createStore();
    const stop = startEditorContextSync(store);

    enter(store, "a", "s1");
    setEditorTabs(store, ["/a/one.ts"], "/a/one.ts");
    expect(host.saveEditorView).toHaveBeenLastCalledWith({
      sessionId: "s1",
      openFiles: ["/a/one.ts"],
      activeFile: "/a/one.ts",
      selections: [],
    });

    enter(store, "a", "s2");
    expect(tabs(store)).toEqual({ openFiles: [], activeFile: null });
    expect(host.saveEditorView).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "s2", openFiles: ["/a/one.ts"] }),
    );

    enter(store, "a", "s1");
    expect(tabs(store)).toEqual({
      openFiles: ["/a/one.ts"],
      activeFile: "/a/one.ts",
    });
    stop();
  });

  it("lets a new chat inherit the tabs of the same workspace's session", () => {
    const store = createStore();
    const stop = startEditorContextSync(store);

    enter(store, "a", "s1");
    setEditorTabs(store, ["/a/one.ts"], "/a/one.ts");
    enter(store, "a", null);
    expect(tabs(store).openFiles).toEqual(["/a/one.ts"]);
    stop();
  });
});
