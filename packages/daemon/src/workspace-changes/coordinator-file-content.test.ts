import type { TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import type { HostCheckpointAdapter } from "./checkpoint";
import {
  readTurnChangeDiff,
  readTurnChangeFileContent,
} from "./coordinator-file-content";

function changeSet(overrides: Partial<TurnChangeSet> = {}): TurnChangeSet {
  return {
    id: "cs1",
    sessionId: "s1",
    messageId: "m1",
    userMessageId: "u1",
    source: "git-checkpoint",
    coverage: "workspace",
    files: [
      {
        path: "notes.md",
        operation: "modify",
        reviewKind: "text",
      },
    ],
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function unusedAdapter(): HostCheckpointAdapter {
  return {
    kind: "filesystem-checkpoint",
    capture: async () => {
      throw new Error("unused");
    },
    diff: async () => {
      throw new Error("unused");
    },
    readFile: async () => {
      throw new Error("unused");
    },
    restorePaths: async () => {
      throw new Error("unused");
    },
    hashWorkingTreeFile: async () => null,
    cleanup: async () => undefined,
  };
}

describe("readTurnChangeDiff", () => {
  it("returns expired when both checkpoint refs are missing", async () => {
    await expect(
      readTurnChangeDiff(
        changeSet({
          hostBeforeCheckpointRef: null,
          hostAfterCheckpointRef: null,
        }),
        { workspaceRootPath: "/tmp" },
        unusedAdapter(),
        new Map(),
      ),
    ).resolves.toEqual({ status: "expired", files: [] });
  });

  it("returns missing when only one checkpoint ref exists", async () => {
    await expect(
      readTurnChangeDiff(
        changeSet({
          hostBeforeCheckpointRef: "before",
          hostBeforeCheckpointKind: "filesystem-checkpoint",
          hostAfterCheckpointRef: null,
        }),
        { workspaceRootPath: "/tmp" },
        unusedAdapter(),
        new Map(),
      ),
    ).resolves.toEqual({ status: "missing", files: [] });
  });
});

describe("readTurnChangeFileContent", () => {
  it("treats recorded size without bytes as an existing omitted file", async () => {
    const checkpoint = {
      id: "after",
      kind: "filesystem-checkpoint" as const,
      ref: "after",
      workspaceRootPath: "/tmp",
    };
    const adapter: HostCheckpointAdapter = {
      ...unusedAdapter(),
      readFile: async () => null,
    };
    await expect(
      readTurnChangeFileContent(
        changeSet({
          hostAfterCheckpointRef: "after",
          hostAfterCheckpointKind: "filesystem-checkpoint",
          files: [
            {
              path: "notes.md",
              operation: "modify",
              reviewKind: "text",
              afterSize: 12_000_000,
            },
          ],
        }),
        {
          sessionId: "s1",
          messageId: "m1",
          path: "notes.md",
          side: "after",
          workspaceRootPath: "/tmp",
        },
        adapter,
        new Map([["after", checkpoint]]),
      ),
    ).resolves.toMatchObject({
      exists: true,
      text: null,
      sizeBytes: 12_000_000,
    });
  });
});
