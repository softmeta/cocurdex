import { requestDaemon } from "@cocurdex/daemon/client";
import type { PersonalAgentRecord } from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

describe("personas through the CLI", () => {
  it("creates, talks to, edits, duplicates, and deletes a persona", async () => {
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
        "--soul",
        "Short answers",
      ])) as PersonalAgentRecord;
      expect(coach).toMatchObject({
        role: { name: "Coach", agentId: "pi", modelId: "e2e-agent-model" },
        soul: "Short answers",
      });

      stub.plan = { kind: "stream", chunks: ["Ten", " push-ups"] };
      expect(
        await cli(["persona", "send", "coach", "Plan today", "--wait"]),
      ).toMatchObject({ persona: coach.id, reply: "Ten push-ups" });
      expect(await cli(["persona", "thread", coach.id])).toEqual([
        expect.objectContaining({ role: "user", content: "Plan today" }),
        expect.objectContaining({ role: "assistant", content: "Ten push-ups" }),
      ]);

      expect(
        await cli(["persona", "update", "Coach", "--name", "Trainer", "--pin"]),
      ).toMatchObject({
        role: {
          id: coach.role.id,
          name: "Trainer",
          modelId: "e2e-agent-model",
        },
        pinnedAt: expect.any(String),
      });
      const copy = (await cli([
        "persona",
        "duplicate",
        "trainer",
        "--name",
        "Trainer 2",
      ])) as PersonalAgentRecord;
      expect(copy.homeSessionId).not.toBe(coach.homeSessionId);

      await cli(["persona", "delete", copy.id]);
      expect(await cli(["persona", "list"])).toEqual([
        expect.objectContaining({
          id: coach.id,
          name: "Trainer",
          pinned: true,
        }),
      ]);
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
