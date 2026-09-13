import type { SessionConfiguration, SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { applySessionConfiguration } from "./configuration";

const input: SessionConfiguration = {
  id: "session-1",
  workspaceId: "workspace-1",
  title: "Configured title",
  agentType: "pi",
  writeMode: "read-only",
  collaborationMode: "default",
};
const original: SessionRecord = {
  ...input,
  title: "Original title",
  status: "running",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  lastMessageAt: "2026-09-02T00:00:00.000Z",
  sessionKind: "subagent",
  parentSessionId: "parent",
};
const now = "2026-09-13T00:00:00.000Z";

describe("session configuration ownership", () => {
  it("preserves daemon-owned lifecycle and parentage while updating configuration", () => {
    expect(applySessionConfiguration(input, original, now)).toEqual({
      ...original,
      title: input.title,
      updatedAt: now,
    });
  });

  it("initializes lifecycle on the daemon for a new session", () => {
    expect(applySessionConfiguration(input, null, now)).toEqual({
      ...input,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    });
  });

  it.each([
    "status",
    "createdAt",
    "lastMessageAt",
    "archivedAt",
    "parentSessionId",
  ])("rejects client-owned %s", (field) => {
    expect(() =>
      applySessionConfiguration({ ...input, [field]: "forged" }, original, now),
    ).toThrow("Unexpected field");
  });

  it("rejects reassignment to another workspace", () => {
    expect(() =>
      applySessionConfiguration(
        { ...input, workspaceId: "other" },
        original,
        now,
      ),
    ).toThrow("cannot change its workspace");
  });

  it("requires explicit restore before configuring an archived session", () => {
    expect(() =>
      applySessionConfiguration(input, { ...original, archivedAt: now }, now),
    ).toThrow("Restore");
  });
});
