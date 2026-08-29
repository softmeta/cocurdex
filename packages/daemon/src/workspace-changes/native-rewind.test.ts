import type { TurnChangeSet, TurnFileChange } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { nativeRewindCoversTransition, tryNativeRewind } from "./native-rewind";

function changeSet(files: TurnFileChange[]): TurnChangeSet {
  return {
    id: "cs-1",
    sessionId: "session-1",
    messageId: "assistant-1",
    userMessageId: "user-1",
    source: "claude-checkpoint",
    coverage: "workspace",
    files,
    status: "ready",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
}

function file(
  path: string,
  overrides: Partial<TurnFileChange> = {},
): TurnFileChange {
  return {
    path,
    operation: "modify",
    reviewKind: "text",
    beforeHash: "before",
    afterHash: "after",
    ...overrides,
  };
}

describe("nativeRewindCoversTransition", () => {
  it("rejects matching paths when native hashes do not prove the host transition", () => {
    const files = [file("src/a.ts")];
    expect(
      nativeRewindCoversTransition(
        changeSet(files),
        {
          canRewind: true,
          filesChanged: ["src/a.ts"],
          insertions: 1,
          deletions: 1,
        },
        [file("src/a.ts", { beforeHash: undefined, afterHash: undefined })],
      ),
    ).toBe(false);
  });

  it("rejects skipped links even when the path set matches", () => {
    const files = [file("src/a.ts")];
    expect(
      nativeRewindCoversTransition(
        changeSet(files),
        {
          canRewind: true,
          filesChanged: ["src/a.ts"],
          skippedLinks: 1,
        },
        files,
      ),
    ).toBe(false);
  });

  it("rejects incomplete path coverage", () => {
    expect(
      nativeRewindCoversTransition(
        changeSet([file("src/a.ts"), file("src/b.ts")]),
        {
          canRewind: true,
          filesChanged: ["src/a.ts"],
        },
        [file("src/a.ts"), file("src/b.ts")],
      ),
    ).toBe(false);
  });

  it("accepts a native preview that matches paths, operations, and hashes", () => {
    const files = [file("src/a.ts")];
    expect(
      nativeRewindCoversTransition(
        changeSet(files),
        {
          canRewind: true,
          filesChanged: ["src/a.ts"],
        },
        files,
      ),
    ).toBe(true);
  });
});

describe("tryNativeRewind", () => {
  it("invokes the real rewind once when native hashes prove the transition", async () => {
    const files = [file("src/a.ts")];
    const calls: Array<{ dryRun?: boolean }> = [];
    const session = {
      getWorkspaceChangeCapabilities() {
        return {
          turnDiff: "tool-level" as const,
          fileRewind: "native" as const,
          coverage: "provider-file-tools" as const,
          conversationRevert: false,
        };
      },
      async rewindNativeWorkspaceChanges(input: { dryRun?: boolean }) {
        calls.push({ dryRun: input.dryRun });
        return {
          canRewind: true,
          filesChanged: ["src/a.ts"],
          skippedLinks: 0,
        };
      },
    };
    const result = await tryNativeRewind(
      session as never,
      {
        ...changeSet(files),
        nativeCheckpointRef: "user-1",
        nativeFiles: files,
      },
      files,
    );
    expect(result).toEqual({ attempted: true, used: true });
    expect(calls).toEqual([{ dryRun: true }, { dryRun: undefined }]);
  });

  it("does not rewind when native hashes are missing", async () => {
    const files = [file("src/a.ts")];
    const result = await tryNativeRewind(
      {
        getWorkspaceChangeCapabilities() {
          return {
            turnDiff: "tool-level" as const,
            fileRewind: "native" as const,
            coverage: "provider-file-tools" as const,
            conversationRevert: false,
          };
        },
        async rewindNativeWorkspaceChanges() {
          return { canRewind: true, filesChanged: ["src/a.ts"] };
        },
      } as never,
      {
        ...changeSet(files),
        nativeCheckpointRef: "user-1",
      },
      [file("src/a.ts", { beforeHash: undefined, afterHash: undefined })],
    );
    expect(result).toEqual({ attempted: false, used: false });
  });

  it("throws when the real rewind reports skipped links after mutating", async () => {
    const files = [file("src/a.ts")];
    let dryRun = true;
    await expect(
      tryNativeRewind(
        {
          getWorkspaceChangeCapabilities() {
            return {
              turnDiff: "tool-level" as const,
              fileRewind: "native" as const,
              coverage: "provider-file-tools" as const,
              conversationRevert: false,
            };
          },
          async rewindNativeWorkspaceChanges() {
            if (dryRun) {
              dryRun = false;
              return {
                canRewind: true,
                filesChanged: ["src/a.ts"],
                skippedLinks: 0,
              };
            }
            return {
              canRewind: true,
              filesChanged: ["src/a.ts"],
              skippedLinks: 1,
            };
          },
        } as never,
        {
          ...changeSet(files),
          nativeCheckpointRef: "user-1",
          nativeFiles: files,
        },
        files,
      ),
    ).rejects.toThrow(/complete selection/);
  });
});
