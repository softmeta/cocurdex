import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  ScriptRunRecord,
  SessionConfiguration,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { type DaemonProcess, spawnDaemon } from "./helpers/daemon-process";

const HANGING_SCRIPT = "await new Promise(() => {});";

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

async function configureRequester(daemon: DaemonProcess) {
  const agents = await requestDaemon("agent.list", daemon.options);
  const agent = agents.find((item) => item.availability === "available");
  if (!agent) return false;
  const rootPath = mkdtempSync(path.join(tmpdir(), "cocurdex-e2e-script-"));
  await requestDaemon(
    "workspace.save",
    { workspace: workspaceRecord(rootPath) },
    daemon.options,
  );
  const requester: SessionConfiguration = {
    id: "requester",
    workspaceId: "e2e-workspace",
    title: "Requester",
    agentType: agent.id,
    writeMode: "read-only",
    collaborationMode: "default",
  };
  await requestDaemon("session.configure", requester, daemon.options);
  return true;
}

async function waitForStatus(
  daemon: DaemonProcess,
  runId: string,
  status: ScriptRunRecord["status"],
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { run } = await requestDaemon(
      "scriptRun.get",
      { runId },
      daemon.options,
    );
    if (run.status === status) return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run ${runId} never reached ${status}`);
}

describe("daemon script runs over the real socket", () => {
  it("validates drafts, saves settings, and cancels with the requester", async () => {
    const daemon = await spawnDaemon();
    try {
      await expect(
        requestDaemon(
          "scriptRun.create",
          { requesterSessionId: "nobody", name: "audit", script: "return 1;" },
          daemon.options,
        ),
      ).rejects.toThrow(/requester_not_found/);
      expect(
        await requestDaemon("scriptRun.settings.get", daemon.options),
      ).toEqual({
        defaultMaxAgents: 5,
        schemaMaxAttempts: 3,
        maxDurationMinutes: null,
      });
      expect(
        await requestDaemon(
          "scriptRun.settings.save",
          { defaultMaxAgents: 7, schemaMaxAttempts: 2, maxDurationMinutes: 30 },
          daemon.options,
        ),
      ).toEqual({
        defaultMaxAgents: 7,
        schemaMaxAttempts: 2,
        maxDurationMinutes: 30,
      });

      if (!(await configureRequester(daemon))) return;
      await expect(
        requestDaemon(
          "scriptRun.create",
          {
            requesterSessionId: "requester",
            name: "audit",
            script: 'await import("node:fs");',
          },
          daemon.options,
        ),
      ).rejects.toThrow(/import\(\)/);
      const draft = await requestDaemon(
        "scriptRun.create",
        {
          requesterSessionId: "requester",
          name: "audit",
          script: HANGING_SCRIPT,
        },
        daemon.options,
      );
      expect(draft).toMatchObject({ status: "draft", maxAgents: 7 });
      await requestDaemon(
        "scriptRun.start",
        { runId: draft.id, maxAgents: 2 },
        daemon.options,
      );
      await waitForStatus(daemon, draft.id, "running");
      await requestDaemon(
        "session.stop",
        { sessionId: "requester" },
        daemon.options,
      );
      expect(await waitForStatus(daemon, draft.id, "cancelled")).toMatchObject({
        maxAgents: 2,
        agentCount: 0,
      });
      expect(
        await requestDaemon(
          "scriptRun.list",
          { requesterSessionId: "requester" },
          daemon.options,
        ),
      ).toHaveLength(1);
    } finally {
      await daemon.dispose();
    }
  });

  it("marks runs left running by a stopped daemon as interrupted", async () => {
    const first = await spawnDaemon();
    let runId: string | null = null;
    try {
      if (!(await configureRequester(first))) return;
      const draft = await requestDaemon(
        "scriptRun.create",
        {
          requesterSessionId: "requester",
          name: "long",
          script: HANGING_SCRIPT,
        },
        first.options,
      );
      await requestDaemon(
        "scriptRun.start",
        { runId: draft.id },
        first.options,
      );
      await waitForStatus(first, draft.id, "running");
      runId = draft.id;
      await first.stop();
    } catch (error) {
      await first.dispose();
      throw error;
    }
    if (!runId) {
      await first.dispose();
      return;
    }

    const second = await spawnDaemon({ userDataPath: first.userDataPath });
    try {
      expect(await waitForStatus(second, runId, "interrupted")).toMatchObject({
        name: "long",
      });
    } finally {
      await second.dispose();
    }
  });
});
