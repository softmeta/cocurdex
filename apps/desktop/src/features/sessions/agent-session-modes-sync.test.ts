import type { AgentDescriptor, SessionRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { applyRuntimeSessionModesAtom } from "./agent-session-modes-sync";
import { agentsAtom, sessionsAtom } from "./session-store";

function agent(
  id: AgentDescriptor["id"],
  transport: "acp" | "native",
): AgentDescriptor {
  return {
    id,
    label: id,
    availability: "available",
    capabilities: {
      sessionModes: [
        { id: "accept-edits", name: "Code" },
        { id: "smart", name: "Smart" },
      ],
      transport,
    },
  } as AgentDescriptor;
}

function session(id: string, agentType: SessionRecord["agentType"]) {
  return { id, agentType } as SessionRecord;
}

const currentModes = [
  { id: "accept-edits", name: "Code" },
  { id: "ask", name: "Ask" },
];

describe("applyRuntimeSessionModesAtom", () => {
  it("replaces a stale ACP agent mode list with the one its session reports", () => {
    const store = createStore();
    store.set(agentsAtom, [agent("acp:devin", "acp")]);
    store.set(sessionsAtom, [session("s1", "acp:devin")]);

    store.set(applyRuntimeSessionModesAtom, {
      type: "session.mode.updated",
      sessionId: "s1",
      currentModeId: "accept-edits",
      availableModes: currentModes,
    });

    expect(store.get(agentsAtom)[0]?.capabilities.sessionModes).toEqual(
      currentModes,
    );
  });

  it("keeps the static mode list of agents that do not use ACP", () => {
    const store = createStore();
    const claude = agent("claude-agent", "native");
    store.set(agentsAtom, [claude]);
    store.set(sessionsAtom, [session("s1", "claude-agent")]);

    store.set(applyRuntimeSessionModesAtom, {
      type: "session.mode.updated",
      sessionId: "s1",
      currentModeId: "accept-edits",
      availableModes: currentModes,
    });

    expect(store.get(agentsAtom)[0]?.capabilities.sessionModes).toEqual(
      claude.capabilities.sessionModes,
    );
  });
});
