import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { SessionConfiguration, WorkspaceRecord } from "@cocurdex/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
  it("lists peers and honors the inbound policy", async () => {
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
    } finally {
      await daemon.dispose();
    }
  });

  it("serves agent tools over HTTP and rejects unknown session tokens", async () => {
    const daemon = await spawnDaemon();
    const url = daemon.metadata.agentToolsUrl;
    try {
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const anonymous = await fetch(url ?? "", { method: "POST" });
      expect(anonymous.status).toBe(401);
      const client = new Client({ name: "e2e", version: "1" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url ?? ""), {
          requestInit: { headers: { Authorization: "Bearer nope" } },
        }),
      );
      try {
        await expect(client.listTools()).rejects.toThrow(/not valid/);
      } finally {
        await client.close();
      }
    } finally {
      await daemon.dispose();
    }
  }, 30_000);
});
