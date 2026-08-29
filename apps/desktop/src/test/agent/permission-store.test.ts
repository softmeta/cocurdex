import type { AgentEvent } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  applyPermissionEventAtom,
  permissionsBySessionAtom,
} from "@/features/agent/permission/permission-store";

describe("permission store", () => {
  it("tracks requested and resolved permissions for a session", () => {
    const store = createStore();
    const sessionId = "session-1";
    const requestedEvent = {
      type: "permission.requested",
      sessionId,
      request: {
        id: "permission-1",
        sessionId,
        providerId: "codex",
        kind: "command",
        title: "pnpm test",
        description: "Run command",
        rawInput: { command: "pnpm test" },
        locations: [],
        options: [
          {
            id: "allow-once",
            kind: "allow_once",
            label: "Allow once",
          },
        ],
        status: "pending",
        createdAt: "2026-05-01T12:00:00.000Z",
        updatedAt: "2026-05-01T12:00:00.000Z",
      },
    } satisfies AgentEvent;

    store.set(applyPermissionEventAtom, requestedEvent);
    store.set(applyPermissionEventAtom, {
      type: "permission.resolved",
      sessionId,
      decision: "allow_once",
      request: {
        ...requestedEvent.request,
        status: "allowed",
        updatedAt: "2026-05-01T12:00:01.000Z",
      },
    });

    expect(store.get(permissionsBySessionAtom)[sessionId]).toEqual([
      {
        ...requestedEvent.request,
        status: "allowed",
        updatedAt: "2026-05-01T12:00:01.000Z",
      },
    ]);
  });
});
