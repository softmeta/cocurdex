import { selectArchivableRoots } from "@cocurdex/daemon/internal/session-control/archive-selection";
import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function session(
  partial: Pick<SessionRecord, "id"> & Partial<SessionRecord>,
): SessionRecord {
  return {
    agentType: "codex",
    sessionModeId: null,
    createdAt: "2026-10-12T00:00:00.000Z",
    lastMessageAt: null,
    parentSessionId: null,
    status: "idle",
    title: partial.id,
    updatedAt: "2026-10-12T00:00:00.000Z",
    workspaceId: "workspace-1",
    writeMode: "native-write",
    ...partial,
  };
}

const notBusy = () => false;

describe("selectArchivableRoots", () => {
  it("archives requested roots and lets children follow their root", () => {
    const sessions = [
      session({ id: "root" }),
      session({ id: "child", parentSessionId: "root" }),
      session({ id: "other" }),
    ];

    expect(
      selectArchivableRoots(sessions, ["root", "child", "other"], notBusy),
    ).toEqual({ rootIds: ["root", "other"], skippedCount: 0 });
  });

  it("skips pinned roots", () => {
    const sessions = [
      session({ id: "pinned", pinnedAt: "2026-10-12T00:00:00.000Z" }),
      session({ id: "plain" }),
    ];

    expect(
      selectArchivableRoots(sessions, ["pinned", "plain"], notBusy),
    ).toEqual({ rootIds: ["plain"], skippedCount: 1 });
  });

  it("skips a root when any session in its tree is busy", () => {
    const sessions = [
      session({ id: "root" }),
      session({ id: "child", parentSessionId: "root" }),
      session({ id: "running", status: "running" }),
      session({ id: "idle" }),
    ];
    const isBusy = (sessionId: string) => sessionId === "child";

    expect(
      selectArchivableRoots(sessions, ["root", "running", "idle"], isBusy),
    ).toEqual({ rootIds: ["idle"], skippedCount: 2 });
  });

  it("ignores unknown ids and children requested without their root", () => {
    const sessions = [
      session({ id: "root" }),
      session({ id: "child", parentSessionId: "root" }),
    ];

    expect(
      selectArchivableRoots(sessions, ["missing", "child"], notBusy),
    ).toEqual({ rootIds: [], skippedCount: 0 });
  });

  it("treats a session whose parent is gone as a root", () => {
    const sessions = [session({ id: "orphan", parentSessionId: "missing" })];

    expect(selectArchivableRoots(sessions, ["orphan"], notBusy)).toEqual({
      rootIds: ["orphan"],
      skippedCount: 0,
    });
  });
});
