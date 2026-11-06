import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { PersonalAgentRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { writeFakeRsrs } from "@cocurdex/test-harness/fixtures/fake-rsrs/index.mjs";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmRequest,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();

interface FakeEntry {
  id: string;
  title: string;
  content: string;
  project: string | null;
}

interface FakeState {
  revision: number;
  live: FakeEntry[];
  deleted: FakeEntry[];
  log: unknown[];
  recalls?: { query: string; project: string | null }[];
  injected?: string[];
}

const SEED: FakeState = {
  revision: 1,
  deleted: [],
  log: [],
  live: [
    {
      id: "m-me",
      title: "Allergic to peanuts",
      content: "The user is allergic to peanuts",
      project: "cocurdex/me",
    },
    {
      id: "m-other",
      title: "Peanut sauce recipe",
      content: "Another assistant keeps peanut recipes",
      project: "cocurdex/agent/other",
    },
    {
      id: "m-loose",
      title: "Peanut farm visit",
      content: "A peanut note outside every partition",
      project: null,
    },
  ],
};

function lastUserText(request: StubLlmRequest) {
  const messages = request.body.messages as {
    role: string;
    content: unknown;
  }[];
  const user = messages.filter((message) => message.role === "user").at(-1);
  return typeof user?.content === "string"
    ? user.content
    : JSON.stringify(user?.content ?? "");
}

function systemText(request: StubLlmRequest) {
  const messages = request.body.messages as {
    role: string;
    content: unknown;
  }[];
  return messages
    .filter(
      (message) => message.role === "system" || message.role === "developer",
    )
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content ?? ""),
    )
    .join("\n");
}

describe("personal assistant memory", () => {
  afterAll(async () => {
    await tempDirs.cleanup();
  });

  it("scopes recall and writes to the persona and keeps its persona in the system prompt", async () => {
    const directory = await tempDirs.create("cocu-persona-memory-");
    const statePath = path.join(directory, "rsrs-state.json");
    await writeFile(statePath, JSON.stringify(SEED), "utf8");
    const readState = async () =>
      JSON.parse(await readFile(statePath, "utf8")) as FakeState;
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      await saveStubProvider(daemon, stub);
      const now = new Date().toISOString();
      await requestDaemon(
        "provider.model.save",
        {
          model: {
            providerId: "e2e-stub",
            modelId: "e2e-agent-model",
            name: "E2E Agent Model",
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
      const useFakeRsrs = async (folder: string) => {
        const cliPath = await writeFakeRsrs(folder, { statePath });
        const settings = await requestDaemon(
          "memory.settings.get",
          daemon.options,
        );
        await requestDaemon(
          "memory.settings.set",
          { settings: { ...settings, enabled: true, cliPath } },
          daemon.options,
        );
        await requestDaemon("memory.status", { refresh: true }, daemon.options);
      };
      await useFakeRsrs(directory);
      const cli = async (args: string[]) => {
        const result = await runCli([...args, "--json"], {
          userDataPath: daemon.userDataPath,
        });
        expect(result.stderr).toBe("");
        expect(result.code).toBe(0);
        return JSON.parse(result.stdout) as unknown;
      };

      const coach = (await cli([
        "persona",
        "create",
        "--name",
        "Coach",
        "--provider",
        "e2e-stub",
        "--model",
        "e2e-agent-model",
        "--instructions",
        "Track the training plan",
        "--soul",
        "Answer like a drill sergeant",
      ])) as PersonalAgentRecord;
      const own = `cocurdex/agent/${coach.id}`;

      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "memory_remember",
                arguments: {
                  title: "Runs on Tuesdays",
                  content: "The training plan has a Tuesday run",
                  force: true,
                },
              },
              {
                name: "memory_remember",
                arguments: {
                  title: "Lives in Lisbon",
                  content: "The user lives in Lisbon",
                  about: "user",
                  force: true,
                },
              },
            ],
          },
          { text: ["Noted"] },
        ],
      };
      await cli([
        "persona",
        "send",
        coach.id,
        "Plan snacks without peanuts",
        "--wait",
      ]);

      for (const request of stub.requests) {
        const system = systemText(request);
        expect(system).toContain("<assistant_persona>");
        expect(system).toContain("Track the training plan");
        expect(system).toContain("Answer like a drill sergeant");
      }
      const first = lastUserText(stub.requests[0]);
      expect(first).not.toContain("Answer like a drill sergeant");
      expect(first).toContain("Allergic to peanuts");
      expect(first).not.toContain("Peanut sauce recipe");
      expect(first).not.toContain("Peanut farm visit");

      const afterFirst = await readState();
      expect(
        afterFirst.recalls?.map((recall) => recall.project).sort(),
      ).toEqual(["cocurdex/me", own].sort());
      expect(afterFirst.live).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Runs on Tuesdays", project: own }),
          expect.objectContaining({
            title: "Lives in Lisbon",
            project: "cocurdex/me",
          }),
        ]),
      );

      await cli(["persona", "update", coach.id, "--soul", "Answer softly"]);
      const sent = stub.requests.length;
      stub.plan = { kind: "stream", chunks: ["Again"] };
      await cli([
        "persona",
        "send",
        coach.id,
        "And peanuts tomorrow?",
        "--wait",
      ]);
      const second = lastUserText(stub.requests[sent]);
      expect(second).not.toContain("Answer softly");
      expect(second).toContain("Allergic to peanuts");
      const secondSystem = systemText(stub.requests[sent]);
      expect(secondSystem).toContain("Answer softly");
      expect(secondSystem.lastIndexOf("Answer softly")).toBeGreaterThan(
        secondSystem.lastIndexOf("Answer like a drill sergeant"),
      );
      expect(secondSystem).toContain("Track the training plan");

      const injectedDirectory = await tempDirs.create("cocu-persona-hosted-");
      await writeFile(
        statePath,
        JSON.stringify({
          ...(await readState()),
          recalls: [],
          injected: ["pi"],
        }),
        "utf8",
      );
      await useFakeRsrs(injectedDirectory);
      const before = stub.requests.length;
      stub.plan = { kind: "stream", chunks: ["Hosted"] };
      await cli(["persona", "send", coach.id, "Peanuts check", "--wait"]);
      expect(lastUserText(stub.requests[before])).not.toContain(
        "Allergic to peanuts",
      );
      expect((await readState()).recalls).toEqual([]);
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
