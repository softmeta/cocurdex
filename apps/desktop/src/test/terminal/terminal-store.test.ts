import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  markTerminalLive,
  openTerminalTabAtom,
  primaryTerminalTabId,
  takeQueuedTerminalCommand,
  workspaceTerminalStatesAtom,
} from "@/features/terminal/terminal-store";

describe("openTerminalTabAtom", () => {
  it("opens a single tab when the implicit primary never started", () => {
    const store = createStore();
    store.set(openTerminalTabAtom, { scopeId: "w1", command: "pnpm dev" });

    const state = store.get(workspaceTerminalStatesAtom).w1;
    expect(state?.tabs).toHaveLength(1);
    expect(state?.activeTabId).toBe(state?.tabs[0]?.id);
  });

  it("keeps a running implicit primary tab beside the new one", () => {
    const store = createStore();
    const primaryId = primaryTerminalTabId("w2");
    markTerminalLive(primaryId, true);
    store.set(openTerminalTabAtom, { scopeId: "w2" });
    markTerminalLive(primaryId, false);

    const tabs = store.get(workspaceTerminalStatesAtom).w2?.tabs ?? [];
    expect(tabs.map((tab) => tab.id)[0]).toBe(primaryId);
    expect(tabs).toHaveLength(2);
  });

  it("queues the command for the new tab exactly once", () => {
    const store = createStore();
    store.set(openTerminalTabAtom, { scopeId: "w3", command: "a\nb" });
    const tabId = store.get(workspaceTerminalStatesAtom).w3?.activeTabId ?? "";

    expect(takeQueuedTerminalCommand(tabId)).toBe("a\rb\r");
    expect(takeQueuedTerminalCommand(tabId)).toBeUndefined();
  });
});
