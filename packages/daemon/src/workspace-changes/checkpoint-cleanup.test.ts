import type { TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { applyCheckpointRetention } from "./checkpoint-cleanup";

function changeSet(
  id: string,
  createdAt: string,
  overrides: Partial<TurnChangeSet> = {},
): TurnChangeSet {
  return {
    id,
    sessionId: "session-1",
    messageId: `assistant-${id}`,
    userMessageId: `user-${id}`,
    source: "filesystem-checkpoint",
    coverage: "workspace",
    files: [],
    hostBeforeCheckpointRef: `before-${id}`,
    hostBeforeCheckpointKind: "filesystem-checkpoint",
    hostAfterCheckpointRef: `after-${id}`,
    hostAfterCheckpointKind: "filesystem-checkpoint",
    hostRecoveryCheckpointRef: `recovery-${id}`,
    hostRecoveryCheckpointKind: "filesystem-checkpoint",
    nativeCheckpointRef: `native-${id}`,
    nativeFiles: [],
    undoable: true,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function repositoryFor(rows: TurnChangeSet[]) {
  const stored = new Map(rows.map((row) => [row.id, row]));
  return {
    stored,
    repository: {
      async listAll() {
        return [...stored.values()];
      },
      async upsert(row: TurnChangeSet) {
        stored.set(row.id, row);
      },
    },
  };
}

describe("checkpoint retention", () => {
  it("keeps review metadata but expires undo checkpoints after thirty days", async () => {
    const { repository, stored } = repositoryFor([
      changeSet("old", "2026-07-01T00:00:00.000Z"),
    ]);

    await applyCheckpointRetention(repository, {
      now: new Date("2026-08-21T00:00:00.000Z"),
    });

    expect(stored.get("old")).toMatchObject({
      id: "old",
      messageId: "assistant-old",
      undoable: false,
      hostBeforeCheckpointRef: null,
      hostAfterCheckpointRef: null,
      hostRecoveryCheckpointRef: null,
      nativeCheckpointRef: null,
    });
  });

  it("expires only stale recovery checkpoints on a recent change set", async () => {
    const { repository, stored } = repositoryFor([
      changeSet("recent", "2026-08-15T00:00:00.000Z"),
    ]);

    await applyCheckpointRetention(repository, {
      now: new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(stored.get("recent")).toMatchObject({
      undoable: true,
      hostBeforeCheckpointRef: "before-recent",
      hostAfterCheckpointRef: "after-recent",
      hostRecoveryCheckpointRef: null,
    });
  });

  it("retains at most one hundred undo checkpoints per session", async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      changeSet(
        String(index),
        new Date(Date.UTC(2026, 7, 21, 0, index)).toISOString(),
      ),
    );
    const { repository, stored } = repositoryFor(rows);

    await applyCheckpointRetention(repository, {
      now: new Date("2026-08-21T03:00:00.000Z"),
    });

    expect(stored.get("0")?.undoable).toBe(false);
    expect(stored.get("1")?.undoable).toBe(true);
  });
});
