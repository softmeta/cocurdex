import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  ScriptRunRecord,
  SessionConfiguration,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmServer,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

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
  const rootPath = tempDirs.createSync("cocurdex-e2e-script-");
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
    sessionModeId: null,
  };
  await requestDaemon("session.configure", requester, daemon.options);
  return true;
}

async function configurePiRequester(
  daemon: DaemonProcess,
  stub: StubLlmServer,
) {
  const rootPath = tempDirs.createSync("cocurdex-e2e-script-");
  await requestDaemon(
    "workspace.save",
    { workspace: workspaceRecord(rootPath) },
    daemon.options,
  );
  await requestDaemon(
    "session.configure",
    {
      id: "requester",
      workspaceId: "e2e-workspace",
      title: "Requester",
      agentType: "pi",
      writeMode: "read-only",
      sessionModeId: null,
      providerSnapshot: await saveStubProvider(daemon, stub),
    },
    daemon.options,
  );
}

async function waitForStatus(
  daemon: DaemonProcess,
  runId: string,
  status: ScriptRunRecord["status"],
) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
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
      ).rejects.toMatchObject({ reason: "scriptRun.requester_not_found" });
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
      ).rejects.toMatchObject({ reason: "scriptRun.invalid_script" });
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

  it("resumes a run left running by a stopped daemon without rerunning finished agents", async () => {
    const stub = await startStubLlmServer();
    const first = await spawnDaemon();
    let runId = "";
    try {
      await configurePiRequester(first, stub);
      stub.plan = { kind: "stream", chunks: ["Alpha"] };
      const draft = await requestDaemon(
        "scriptRun.create",
        {
          requesterSessionId: "requester",
          name: "resume",
          script: [
            'const found = await agent("Collect the inventory");',
            'return [found, await agent("Summarize " + found)];',
          ].join("\n"),
        },
        first.options,
      );
      await requestDaemon(
        "scriptRun.start",
        { runId: draft.id },
        first.options,
      );
      await stub.nextRequest();
      stub.plan = { kind: "hang" };
      await stub.nextRequest();
      runId = draft.id;
      await first.stop();
    } catch (error) {
      await first.dispose();
      await stub.close();
      throw error;
    }

    stub.plan = { kind: "stream", chunks: ["Beta"] };
    const resumedFrom = stub.requests.length;
    const second = await spawnDaemon({ userDataPath: first.userDataPath });
    try {
      const run = await waitForStatus(second, runId, "completed");
      expect(JSON.parse(run.resultJson ?? "null")).toEqual(["Alpha", "Beta"]);
      const resumedRequests = stub.requests.slice(resumedFrom);
      expect(resumedRequests.length).toBeGreaterThan(0);
      expect(
        resumedRequests.some((request) =>
          JSON.stringify(request.body).includes("Collect the inventory"),
        ),
      ).toBe(false);
      const { agents } = await requestDaemon(
        "scriptRun.get",
        { runId },
        second.options,
      );
      expect(agents.map((agent) => agent.status).sort()).toEqual([
        "cancelled",
        "completed",
        "completed",
      ]);
    } finally {
      await second.dispose();
      await stub.close();
    }
  });
});
