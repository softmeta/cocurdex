import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGitStateMetadataPath } from "./workspace-watch-service";

describe("isGitStateMetadataPath", () => {
  it.each([
    "HEAD",
    "index",
    "MERGE_HEAD",
    "ORIG_HEAD",
    "packed-refs",
    path.join("refs", "heads", "main"),
    path.join("refs", "remotes", "origin", "main"),
  ])("includes visible git state path %s", (metadataPath) => {
    expect(isGitStateMetadataPath(metadataPath)).toBe(true);
  });

  it.each([
    "HEAD.lock",
    "index.lock",
    path.join("objects", "ab", "commit"),
    path.join("logs", "HEAD"),
    path.join("worktrees", "other", "HEAD"),
  ])("ignores git implementation path %s", (metadataPath) => {
    expect(isGitStateMetadataPath(metadataPath)).toBe(false);
  });
});
