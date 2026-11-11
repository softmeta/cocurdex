import net from "node:net";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  buildHostPairingLink,
  type DelegatedWorkRecord,
  type DelegationCatalog,
  type MessageRecord,
  type PersonalAgentRecord,
  type RemoteHostPairing,
  type RemoteHostRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port")),
      );
    });
  });
}

async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!accept(value)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out; last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    value = await read();
  }
  return value;
}

async function saveAgentModel(daemon: DaemonProcess) {
  const now = new Date().toISOString();
  await requestDaemon(
    "provider.model.save",
    {
      model: {
        providerId: "e2e-stub",
        modelId: "e2e-agent-model",
        name: "e2e-agent-model",
        api: "openai-completions",
        enabled: true,
        source: "manual",
        capabilities: ["chat", "agent"],
        createdAt: now,
        updatedAt: now,
      },
    },
    daemon.options,
  );
}

function cliFor(daemon: DaemonProcess) {
  const run = (args: string[]) =>
    runCli([...args, "--json"], { userDataPath: daemon.userDataPath });
  const cli = async <T>(args: string[]) => {
    const result = await run(args);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    return JSON.parse(result.stdout) as T;
  };
  return { run, cli };
}

async function setUpRemote(remote: DaemonProcess) {
  const now = new Date().toISOString();
  const workspace: WorkspaceRecord = {
    id: "e2e-remote-shop",
    name: "Shop",
    rootPaths: [tempDirs.createSync("cocurdex-e2e-federated-")],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  };
  await requestDaemon("workspace.save", { workspace }, remote.options);
  await requestDaemon(
    "agentRole.save",
    {
      name: "Builder",
      agentId: "pi",
      providerId: "e2e-stub",
      modelId: "e2e-agent-model",
      modelName: "e2e-agent-model",
      permissionMode: null,
      sessionModeId: null,
      reasoningEffort: null,
      serviceTier: null,
      fastMode: null,
      thinkingLevel: null,
      openCodeAgent: null,
      openCodeVariant: null,
    },
    remote.options,
  );
  const port = await freePort();
  await requestDaemon(
    "host.remoteAccess.set",
    { enabled: true, port },
    remote.options,
  );
  const { code, hostKey } = await requestDaemon(
    "host.pairing.create",
    { label: "Laptop", scopes: ["read", "interact", "execute"] },
    remote.options,
  );
  return buildHostPairingLink(`http://127.0.0.1:${port}`, code, hostKey);
}

describe("federated work", () => {
  it("delegates from an assistant to a paired computer and reports back", async () => {
    const stub = await startStubLlmServer();
    const local = await spawnDaemon();
    const remote = await spawnDaemon();
    try {
      for (const daemon of [local, remote]) {
        await saveStubProvider(daemon, stub);
        await saveAgentModel(daemon);
      }
      const link = await setUpRemote(remote);
      const { run, cli } = cliFor(local);

      const pairing = await cli<RemoteHostPairing>([
        "host",
        "remotes",
        "pair",
        link,
        "--label",
        "Laptop",
      ]);
      expect(pairing.missingScopes).toEqual([]);
      expect(pairing.host.status).toBe("pending");
      const pending = await run([
        "host",
        "remotes",
        "workspaces",
        pairing.host.hostId,
      ]);
      expect(pending.code).not.toBe(0);

      const approval = await requestDaemon(
        "host.devices.approve",
        { deviceId: pairing.host.deviceId, code: pairing.host.safetyCode },
        remote.options,
      );
      expect(approval.ok).toBe(true);

      const workspaces = await cli<DelegationCatalog["workspaces"]>([
        "host",
        "remotes",
        "workspaces",
        pairing.host.hostId,
      ]);
      expect(workspaces.map((workspace) => workspace.name)).toContain("Shop");
      const [listed] = await cli<RemoteHostRecord[]>([
        "host",
        "remotes",
        "list",
      ]);
      expect(listed).toMatchObject({
        hostId: pairing.host.hostId,
        status: "connected",
      });

      const coach = await cli<PersonalAgentRecord>([
        "persona",
        "create",
        "--name",
        "Coach",
        "--provider",
        "e2e-stub",
        "--model",
        "e2e-agent-model",
      ]);
      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "work_start",
                arguments: {
                  host: pairing.host.hostId,
                  workspace: "Shop",
                  prompt: "Fix the checkout bug",
                  title: "Fix checkout",
                  agentRole: "Builder",
                },
              },
            ],
          },
          { text: ["Checkout fixed"] },
          { text: ["Checkout fixed"] },
          { text: ["Checkout fixed"] },
        ],
      };
      await cli(["persona", "send", "Coach", "Fix checkout on Shop", "--wait"]);

      const [work] = await eventually(
        () => cli<DelegatedWorkRecord[]>(["persona", "work", "list", "Coach"]),
        (works) => works[0]?.state === "completed",
      );
      expect(work).toMatchObject({
        title: "Fix checkout",
        workspaceName: "Shop",
        host: { id: pairing.host.hostId, reachable: true },
      });

      const remoteSnapshot = await requestDaemon(
        "session.snapshot",
        { sessionId: work.sessionId },
        remote.options,
      );
      expect(remoteSnapshot?.messages[0]).toMatchObject({
        role: "user",
        origin: { kind: "remoteHost", hostName: "Laptop", senderName: "Coach" },
      });

      const localThread = async (): Promise<MessageRecord[]> =>
        (
          await requestDaemon(
            "session.snapshot",
            { sessionId: coach.homeSessionId },
            local.options,
          )
        )?.messages ?? [];
      const thread = await eventually(localThread, (items) =>
        items.some(
          (item) =>
            item.origin?.kind === "remoteHost" &&
            item.origin.sessionId === work.sessionId,
        ),
      );
      const report = thread.find((item) => item.origin?.kind === "remoteHost");
      expect(report?.content).toContain('Work session "Fix checkout"');
      expect(report?.content).toContain("Checkout fixed");
      expect(
        await requestDaemon(
          "session.get",
          { sessionId: work.sessionId },
          local.options,
        ),
      ).toBeNull();

      const removed = await run([
        "host",
        "remotes",
        "remove",
        pairing.host.hostId,
      ]);
      expect(removed.code).toBe(0);
      expect(
        await cli<DelegatedWorkRecord[]>(["persona", "work", "list", "Coach"]),
      ).toEqual([]);
      const devices = await requestDaemon("host.devices.list", remote.options);
      expect(
        devices.find((device) => device.id === pairing.host.deviceId)
          ?.revokedAt,
      ).toEqual(expect.any(String));
    } finally {
      await Promise.all([local.dispose(), remote.dispose()]);
      await stub.close();
    }
  });
});
