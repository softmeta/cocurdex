import type { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import { AGENT_RUN_LIMITS_SETTING_KEY } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import { createService, scriptRuntime } from "./team-test-harness";

async function limitRuns(
  service: CocurdexDaemonService,
  maxConcurrentRunsPerAgent: number,
) {
  await service.setSettingValue({
    key: AGENT_RUN_LIMITS_SETTING_KEY,
    value: {
      maxConcurrentRuns: 8,
      maxConcurrentRunsPerAgent,
      delegatedRunTimeoutMinutes: 60,
    },
    workspaceId: "workspace-1",
  });
}

describe("delegated run limits", () => {
  it("holds a teammate past the per-agent limit and starts it once a slot frees", async () => {
    const { service } = await createService();
    const runtime = scriptRuntime(service);
    vi.spyOn(service.team, "onAgentEvent").mockResolvedValue();
    try {
      await limitRuns(service, 1);
      const alpha = await service.team.spawn("lead", {
        name: "alpha",
        prompt: "Plan the change",
      });
      const beta = await service.team.spawn("lead", {
        name: "beta",
        prompt: "Implement the plan",
      });

      expect(service.runs.hasActiveRun(alpha.sessionId)).toBe(true);
      expect(service.runs.hasActiveRun(beta.sessionId)).toBe(false);
      expect(
        (await service.state.listQueuedAgentInputs(beta.sessionId)).length,
      ).toBe(1);
      const betaOutcome = service.waitForSessionTurn(beta.sessionId);

      (await runtime.turnFor(alpha.sessionId)).finish("Plan ready");
      (await runtime.turnFor(beta.sessionId)).finish("Implemented");

      await expect(betaOutcome).resolves.toMatchObject({
        status: "completed",
        message: { content: "Implemented" },
      });
      expect(await service.state.listQueuedAgentInputs(beta.sessionId)).toEqual(
        [],
      );
    } finally {
      for (const turn of runtime.turns) turn.finish("cleanup");
      await service.shutdown();
    }
  });

  it("never holds a run the user starts, even when delegated work fills the host", async () => {
    const { service } = await createService();
    const runtime = scriptRuntime(service);
    vi.spyOn(service.team, "onAgentEvent").mockResolvedValue();
    try {
      await limitRuns(service, 1);
      const alpha = await service.team.spawn("lead", {
        name: "alpha",
        prompt: "Plan the change",
      });
      await service.sendSessionMessage({
        sessionId: "lead",
        messageId: "user-message",
        content: "Status?",
      });

      expect(service.runs.hasActiveRun(alpha.sessionId)).toBe(true);
      expect(service.runs.hasActiveRun("lead")).toBe(true);
    } finally {
      for (const turn of runtime.turns) turn.finish("cleanup");
      await service.shutdown();
    }
  });

  it("stops waiting for a slot when the held teammate is stopped", async () => {
    const { service } = await createService();
    const runtime = scriptRuntime(service);
    vi.spyOn(service.team, "onAgentEvent").mockResolvedValue();
    try {
      await limitRuns(service, 1);
      await service.team.spawn("lead", { name: "alpha", prompt: "Plan" });
      const beta = await service.team.spawn("lead", {
        name: "beta",
        prompt: "Implement",
      });
      const betaOutcome = service.waitForSessionTurn(beta.sessionId);

      await service.stopSession(beta.sessionId);

      await expect(betaOutcome).resolves.toEqual({ status: "cancelled" });
    } finally {
      for (const turn of runtime.turns) turn.finish("cleanup");
      await service.shutdown();
    }
  });
});
