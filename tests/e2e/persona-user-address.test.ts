import { requestDaemon } from "@cocurdex/daemon/client";
import type { PersonalAgentRecord } from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmRequest,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

function systemText(request: StubLlmRequest | undefined) {
  const messages = (request?.body.messages ?? []) as {
    role: string;
    content: unknown;
  }[];
  return messages
    .filter((message) => message.role === "system")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
    )
    .join("\n");
}

describe("persona user address", () => {
  it("saves what the user asked to be called per persona and addresses them by it on later turns", async () => {
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
      const cli = async <T>(args: string[]) => {
        const result = await runCli([...args, "--json"], {
          userDataPath: daemon.userDataPath,
        });
        expect(result.stderr).toBe("");
        expect(result.code).toBe(0);
        return JSON.parse(result.stdout) as T;
      };
      const model = ["--provider", "e2e-stub", "--model", "e2e-agent-model"];
      const coach = await cli<PersonalAgentRecord>([
        "persona",
        "create",
        "--name",
        "Coach",
        ...model,
      ]);
      const writer = await cli<PersonalAgentRecord>([
        "persona",
        "create",
        "--name",
        "Writer",
        "--user-address",
        "Captain",
        ...model,
      ]);
      expect([coach.userAddress, writer.userAddress]).toEqual([
        null,
        "Captain",
      ]);

      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "assistant_set_user_address",
                arguments: { address: "Xiao Li" },
              },
            ],
          },
          { text: ["Got it, Xiao Li."] },
          { text: ["Here is your plan, Xiao Li."] },
        ],
      };
      await cli(["persona", "send", coach.id, "Call me Xiao Li", "--wait"]);
      expect(systemText(stub.requests[0])).toContain(
        "You do not know yet what to call the user",
      );
      await cli(["persona", "send", coach.id, "Plan my day", "--wait"]);

      expect(systemText(stub.requests.at(-1))).toContain(
        'Address the user as "Xiao Li"',
      );
      const [savedCoach, savedWriter] = await Promise.all([
        cli<PersonalAgentRecord>(["persona", "show", coach.id]),
        cli<PersonalAgentRecord>(["persona", "show", writer.id]),
      ]);
      expect(savedCoach.userAddress).toBe("Xiao Li");
      expect(savedWriter.userAddress).toBe("Captain");

      const cleared = await cli<PersonalAgentRecord>([
        "persona",
        "update",
        coach.id,
        "--user-address",
        "",
      ]);
      expect(cleared.userAddress).toBeNull();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
