import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  AGENT_TOOL_TOKEN_ENV,
  AGENT_TOOL_USER_DATA_PATH_ENV,
  type SessionConfiguration,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { repoRoot, spawnDaemon } from "./helpers/daemon-process";

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

function sessionConfiguration(
  id: string,
  agentType: SessionConfiguration["agentType"],
): SessionConfiguration {
  return {
    id,
    workspaceId: "e2e-workspace",
    title: `Session ${id}`,
    agentType,
    writeMode: "read-only",
    collaborationMode: "default",
  };
}

describe("daemon peer messaging over the real socket", () => {
  it("lists peers, honors the inbound policy, and rejects unknown agent tool tokens", async () => {
    const daemon = await spawnDaemon();
    try {
      const agents = await requestDaemon("agent.list", daemon.options);
      const agent = agents.find((item) => item.availability === "available");
      if (!agent) {
        return;
      }
      const rootPath = mkdtempSync(path.join(tmpdir(), "cocurdex-e2e-peer-"));
      await requestDaemon(
        "workspace.save",
        { workspace: workspaceRecord(rootPath) },
        daemon.options,
      );
      await requestDaemon(
        "session.configure",
        sessionConfiguration("peer-a", agent.id),
        daemon.options,
      );
      await requestDaemon(
        "session.configure",
        sessionConfiguration("peer-b", agent.id),
        daemon.options,
      );

      const peers = await requestDaemon(
        "session.listPeers",
        { sessionId: "peer-a" },
        daemon.options,
      );
      expect(peers.map((peer) => peer.sessionId)).toEqual(["peer-b"]);

      const refusing = await requestDaemon(
        "session.setPeerInbound",
        { sessionId: "peer-b", policy: "refuse" },
        daemon.options,
      );
      expect(refusing.peerInbound).toBe("refuse");

      const refused = await requestDaemon(
        "session.sendPeerMessage",
        { fromSessionId: "peer-a", toSessionId: "peer-b", content: "hello" },
        daemon.options,
      );
      expect(refused).toEqual({ messageId: null, delivery: "refused" });
      const snapshot = await requestDaemon(
        "session.snapshot",
        { sessionId: "peer-b" },
        daemon.options,
      );
      expect(snapshot?.messages ?? []).toEqual([]);

      await expect(
        requestDaemon("agentTool.catalog", { token: "nope" }, daemon.options),
      ).rejects.toThrow(/not valid/);
      await expect(
        requestDaemon(
          "agentTool.call",
          { token: "nope", name: "messaging_list_agents", input: {} },
          daemon.options,
        ),
      ).rejects.toThrow(/not valid/);
    } finally {
      await daemon.dispose();
    }
  });

  it("boots the stdio agent tool server and surfaces daemon authorization errors", async () => {
    const daemon = await spawnDaemon();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        path.join(repoRoot, "packages", "daemon", "src", "bin.ts"),
        "agent-tools",
      ],
      cwd: path.join(repoRoot, "packages", "daemon"),
      env: {
        ...(process.env as Record<string, string>),
        [AGENT_TOOL_TOKEN_ENV]: "nope",
        [AGENT_TOOL_USER_DATA_PATH_ENV]: daemon.userDataPath,
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "e2e", version: "1" });
    try {
      await client.connect(transport);
      await expect(client.listTools()).rejects.toThrow(/not valid/);
    } finally {
      await client.close().catch(() => undefined);
      await daemon.dispose();
    }
  }, 30_000);
});
