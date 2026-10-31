import { requestDaemon } from "@cocurdex/daemon/client";
import type { AgentSessionRuntimeState, SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { startChatSession } from "./helpers/chat-session";
import { runCli } from "./helpers/cli";
import { spawnDaemon } from "./helpers/daemon-process";
import { startStubLlmServer } from "./helpers/llm-stub";

describe("session runtime through the CLI", () => {
  it("reads runtime state and changes a session's model and thinking level", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const session = await startChatSession(daemon, stub);
      const now = new Date().toISOString();
      await requestDaemon(
        "provider.model.save",
        {
          model: {
            providerId: "e2e-stub",
            modelId: "e2e-model-large",
            name: "E2E Model Large",
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
      const cli = (args: string[]) =>
        runCli(args, { userDataPath: daemon.userDataPath });

      const state = await cli(["session", "runtime", session.id, "--json"]);
      expect(state.stderr).toBe("");
      expect(JSON.parse(state.stdout) as AgentSessionRuntimeState).toEqual(
        expect.objectContaining({ configOptions: expect.any(Array) }),
      );

      const configured = await cli([
        "session",
        "configure",
        session.id,
        "--provider",
        "e2e-stub",
        "--model",
        "e2e-model-large",
        "--thinking",
        "high",
        "--json",
      ]);
      expect(configured.stderr).toBe("");
      expect(
        (JSON.parse(configured.stdout) as SessionRecord).providerSnapshot,
      ).toMatchObject({ modelId: "e2e-model-large", thinkingLevel: "high" });

      const reset = await cli([
        "session",
        "configure",
        session.id,
        "--thinking",
        "default",
        "--json",
      ]);
      expect(
        (JSON.parse(reset.stdout) as SessionRecord).providerSnapshot,
      ).toMatchObject({ modelId: "e2e-model-large", thinkingLevel: null });

      const rejected = await cli([
        "session",
        "configure",
        session.id,
        "--thinking",
        "loud",
      ]);
      expect(rejected.code).not.toBe(0);
      expect(rejected.stderr).toContain("Unknown --thinking loud");
      const stored = await requestDaemon(
        "session.get",
        { sessionId: session.id },
        daemon.options,
      );
      expect(stored?.providerSnapshot?.modelId).toBe("e2e-model-large");
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
