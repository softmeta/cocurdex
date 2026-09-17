import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createUnifiedDiff, type TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import type { HostCheckpoint, HostCheckpointAdapter } from "./checkpoint";
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

async function createWorkspaceFile(content: string) {
  const root = await mkdtemp(path.join(tmpdir(), "cocurdex-turn-content-"));
  await writeFile(path.join(root, "notes.md"), content, "utf8");
  return root;
}

function partialChangeSet(files: TurnChangeSet["files"]): TurnChangeSet {
  return changeSet({
    hostBeforeCheckpointRef: "before",
    hostBeforeCheckpointKind: "filesystem-checkpoint",
    hostAfterCheckpointRef: null,
    status: "partial",
    files,
  });
}

function beforeAdapter(beforeText: string): HostCheckpointAdapter {
  return {
    ...unusedAdapter(),
    readFile: async () => Buffer.from(beforeText, "utf8"),
  };
}

const beforeCheckpoints = new Map<string, HostCheckpoint>([
  [
    "before",
    {
      id: "before",
      kind: "filesystem-checkpoint",
      ref: "before",
      workspaceRootPath: "/tmp",
    },
  ],
]);

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

  it("returns missing when the before checkpoint ref is missing", async () => {
    await expect(
      readTurnChangeDiff(
        changeSet({
          hostBeforeCheckpointRef: null,
          hostAfterCheckpointRef: "after",
          hostAfterCheckpointKind: "filesystem-checkpoint",
        }),
        { workspaceRootPath: "/tmp" },
        unusedAdapter(),
        new Map(),
      ),
    ).resolves.toEqual({ status: "missing", files: [] });
  });

  it("reads the after side from the working tree when its patch still matches", async () => {
    const workspaceRootPath = await createWorkspaceFile("two\n");
    const patch = createUnifiedDiff("notes.md", "one\n", "two\n").patch;
    await expect(
      readTurnChangeDiff(
        partialChangeSet([
          {
            path: "notes.md",
            operation: "modify",
            reviewKind: "text",
            patch,
          },
        ]),
        { workspaceRootPath },
        beforeAdapter("one\n"),
        beforeCheckpoints,
      ),
    ).resolves.toEqual({
      status: "ok",
      files: [
        {
          path: "notes.md",
          changeType: "modified",
          oldContents: "one\n",
          newContents: "two\n",
          omittedReason: null,
        },
      ],
    });
  });

  it("accepts the working tree when the recorded after hash matches", async () => {
    const workspaceRootPath = await createWorkspaceFile("two\n");
    const adapter: HostCheckpointAdapter = {
      ...beforeAdapter("one\n"),
      hashWorkingTreeFile: async () => "after-hash",
    };
    await expect(
      readTurnChangeDiff(
        partialChangeSet([
          {
            path: "notes.md",
            operation: "modify",
            reviewKind: "text",
            afterHash: "after-hash",
          },
        ]),
        { workspaceRootPath },
        adapter,
        beforeCheckpoints,
      ),
    ).resolves.toEqual({
      status: "ok",
      files: [
        {
          path: "notes.md",
          changeType: "modified",
          oldContents: "one\n",
          newContents: "two\n",
          omittedReason: null,
        },
      ],
    });
  });

  it("marks the after side unavailable when the file changed after the turn", async () => {
    const workspaceRootPath = await createWorkspaceFile("three\n");
    const patch = createUnifiedDiff("notes.md", "one\n", "two\n").patch;
    await expect(
      readTurnChangeDiff(
        partialChangeSet([
          {
            path: "notes.md",
            operation: "modify",
            reviewKind: "text",
            patch,
          },
        ]),
        { workspaceRootPath },
        beforeAdapter("one\n"),
        beforeCheckpoints,
      ),
    ).resolves.toEqual({
      status: "ok",
      files: [
        {
          path: "notes.md",
          changeType: "modified",
          oldContents: "",
          newContents: "",
          omittedReason: "unavailable",
        },
      ],
    });
  });

  it("keeps a deleted file readable when its after checkpoint is missing", async () => {
    const workspaceRootPath = await createWorkspaceFile("two\n");
    await expect(
      readTurnChangeDiff(
        partialChangeSet([
          {
            path: "notes.md",
            operation: "delete",
            reviewKind: "text",
            beforeHash: "before-hash",
          },
        ]),
        { workspaceRootPath },
        beforeAdapter("one\n"),
        beforeCheckpoints,
      ),
    ).resolves.toEqual({
      status: "ok",
      files: [
        {
          path: "notes.md",
          changeType: "deleted",
          oldContents: "one\n",
          newContents: "",
          omittedReason: null,
        },
      ],
    });
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
