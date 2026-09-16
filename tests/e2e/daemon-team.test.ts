import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { SessionConfiguration, WorkspaceRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { spawnDaemon } from "./helpers/daemon-process";

function workspaceRecord(rootPath: string): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id: "e2e-workspace",
    name: "e2e-workspace",
    rootPaths: [rootPath],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  };
}

describe("daemon team RPC over the real socket", () => {
  it("validates spawn requests and reports missing teams", async () => {
    const daemon = await spawnDaemon();
    try {
      expect(
        await requestDaemon(
          "team.get",
          { leadSessionId: "nobody" },
          daemon.options,
        ),
      ).toBeNull();
      await expect(
        requestDaemon(
          "team.spawn",
          { leadSessionId: "nobody", name: "alpha", prompt: "go" },
          daemon.options,
        ),
      ).rejects.toThrow(/lead_not_found/);
      await expect(
        requestDaemon("team.stop", { teamId: "nope" }, daemon.options),
      ).rejects.toThrow(/team_not_found/);

      const agents = await requestDaemon("agent.list", daemon.options);
      const agent = agents.find((item) => item.availability === "available");
      if (!agent) {
        return;
      }
      const rootPath = mkdtempSync(path.join(tmpdir(), "cocurdex-e2e-team-"));
      await requestDaemon(
        "workspace.save",
        { workspace: workspaceRecord(rootPath) },
        daemon.options,
      );
      const lead: SessionConfiguration = {
        id: "lead",
        workspaceId: "e2e-workspace",
        title: "Lead",
        agentType: agent.id,
        writeMode: "read-only",
        collaborationMode: "default",
      };
      await requestDaemon("session.configure", lead, daemon.options);
      await expect(
        requestDaemon(
          "team.spawn",
          { leadSessionId: "lead", name: "Bad Name", prompt: "go" },
          daemon.options,
        ),
      ).rejects.toThrow(/invalid_name/);
      expect(
        await requestDaemon(
          "team.get",
          { leadSessionId: "lead" },
          daemon.options,
        ),
      ).toBeNull();
    } finally {
      await daemon.dispose();
    }
  });
});
