import type { KeyValueStorage } from "@cocurdex/client-runtime";
import {
  chooseAgent,
  chooseModel,
  choosePermissionMode,
  chooseRole,
  chooseRuntime,
  chooseWorkspace,
  EMPTY_DRAFT,
} from "@cocurdex/mobile/internal/new-session/new-session-draft";
import { createNewSessionStore } from "@cocurdex/mobile/internal/new-session/new-session-state";
import { describe, expect, it, vi } from "vitest";

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("new session preferences", () => {
  it("restores choices after reopening and restarting, independently per host", () => {
    const storage = memoryStorage();
    const store = createNewSessionStore(storage);
    store.begin("host-a");
    store.update((draft) => chooseWorkspace(draft, "shop"));
    store.update((draft) => chooseRole(draft, { id: "review", agentId: "pi" }));
    store.update((draft) =>
      chooseModel(draft, "pi", { providerId: "custom", modelId: "model" }),
    );
    store.update((draft) =>
      chooseRuntime(draft, "pi", { thinkingLevel: "high" }),
    );
    const selected = store.getSnapshot().draft;

    store.begin("host-a");
    expect(store.getSnapshot().draft).toEqual(selected);
    store.begin("host-b");
    expect(store.getSnapshot().draft).toEqual(EMPTY_DRAFT);
    store.update((draft) => chooseAgent(draft, "codex"));
    store.update((draft) =>
      choosePermissionMode(draft, "codex", "codex-read-only"),
    );

    const restarted = createNewSessionStore(storage);
    restarted.begin("host-a");
    expect(restarted.getSnapshot().draft).toEqual(selected);
    restarted.begin("host-b");
    expect(restarted.getSnapshot().draft.agentType).toBe("codex");
    expect(restarted.getSnapshot().draft.permissionMode).toBe(
      "codex-read-only",
    );
  });

  it("persists cleared agent-specific choices instead of resurrecting them", () => {
    const storage = memoryStorage();
    const store = createNewSessionStore(storage);
    store.begin("host-a");
    store.update((draft) => chooseRole(draft, { id: "review", agentId: "pi" }));
    store.update((draft) =>
      chooseRuntime(draft, "pi", { thinkingLevel: "high" }),
    );
    store.update((draft) => chooseAgent(draft, "codex"));
    store.begin("host-a");
    expect(store.getSnapshot().draft).toEqual({
      workspaceId: null,
      agentType: "codex",
    });
  });

  it.each([null, "{broken", "null", "[]", '{"workspaceId":42}'])(
    "uses defaults for invalid stored data: %s",
    (text) => {
      const store = createNewSessionStore({
        getItem: () => text,
        setItem: vi.fn(),
      });
      store.begin("host-a");
      expect(store.getSnapshot().draft).toEqual(EMPTY_DRAFT);
    },
  );

  it("keeps the form usable if device storage is unavailable", () => {
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    const store = createNewSessionStore({
      getItem: unavailable,
      setItem: unavailable,
    });
    store.begin("host-a");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update((draft) => chooseAgent(draft, "pi"));
    expect(store.getSnapshot().draft.agentType).toBe("pi");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
