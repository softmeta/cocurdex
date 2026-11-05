import type { SessionRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  beginSessionSendAtom,
  bootstrapSessionsAtom,
  mergeSessionChangesAtom,
  sessionsAtom,
  settleSessionSendAtom,
  updateSessionStatusAtom,
  upsertSessionAtom,
} from "@/features/sessions/session-store";

const session: SessionRecord = {
  id: "session-1",
  workspaceId: "workspace-1",
  title: "First send",
  agentType: "pi",
  status: "idle",
  writeMode: "read-only",
  sessionModeId: null,
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
  lastMessageAt: null,
};

function statusOf(store: ReturnType<typeof createStore>) {
  return store.get(sessionsAtom).find((item) => item.id === session.id)?.status;
}

function startedSend() {
  const store = createStore();
  store.set(bootstrapSessionsAtom, [session]);
  store.set(beginSessionSendAtom, session.id);
  return store;
}

describe("session sends in flight", () => {
  it("keeps a sending session running when a snapshot taken before the daemon accepted the send arrives", () => {
    const store = startedSend();

    store.set(mergeSessionChangesAtom, {
      sessions: [session],
      removedSessionIds: [],
    });
    expect(statusOf(store)).toBe("running");

    store.set(upsertSessionAtom, session);
    expect(statusOf(store)).toBe("running");
  });

  it("applies the daemon's other session fields while holding the status", () => {
    const store = startedSend();

    store.set(mergeSessionChangesAtom, {
      sessions: [{ ...session, title: "Configured" }],
      removedSessionIds: [],
    });

    expect(store.get(sessionsAtom)[0]).toMatchObject({
      title: "Configured",
      status: "running",
    });
  });

  it("lets snapshots decide the status again once the send settles", () => {
    const store = startedSend();
    store.set(settleSessionSendAtom, session.id);

    store.set(upsertSessionAtom, session);

    expect(statusOf(store)).toBe("idle");
  });

  it("holds the status until every overlapping send to the session settles", () => {
    const store = startedSend();
    store.set(beginSessionSendAtom, session.id);
    store.set(settleSessionSendAtom, session.id);

    store.set(upsertSessionAtom, session);
    expect(statusOf(store)).toBe("running");

    store.set(settleSessionSendAtom, session.id);
    store.set(upsertSessionAtom, session);
    expect(statusOf(store)).toBe("idle");
  });

  it("does not hold a failed send's error status against a snapshot", () => {
    const store = startedSend();
    store.set(updateSessionStatusAtom, {
      sessionId: session.id,
      status: "error",
    });

    store.set(upsertSessionAtom, session);

    expect(statusOf(store)).toBe("idle");
  });

  it("still applies live status events while a send is in flight", () => {
    const store = startedSend();

    store.set(updateSessionStatusAtom, {
      sessionId: session.id,
      status: "idle",
    });

    expect(statusOf(store)).toBe("idle");
  });
});
