import type { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import { teammateReportMessageId } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import {
  assistantMessage,
  createService,
  scriptRuntime,
} from "./team-test-harness";

async function spawnTeammate(service: CocurdexDaemonService) {
  const member = await service.team.spawn("lead", {
    name: "alpha",
    prompt: "Review the auth module",
  });
  const runId = service.runs.activeRunId(member.sessionId);
  if (!runId) throw new Error("Teammate run did not start");
  return { member, runId };
}

describe("teammate reports", () => {
  it("wakes an idle lead with the teammate's final reply", async () => {
    const { service } = await createService();
    const runtime = scriptRuntime(service);
    try {
      const { member, runId } = await spawnTeammate(service);
      (await runtime.turnFor(member.sessionId)).finish("Auth looks fine");

      const reportId = teammateReportMessageId(runId);
      await vi.waitFor(() =>
        expect(service.runs.activeRuns()).toEqual([
          expect.objectContaining({
            sessionId: "lead",
            triggerMessageId: reportId,
          }),
        ]),
      );
      const report = await service.state.getMessageById(reportId);
      expect(report?.content).toBe(
        '[Teammate "alpha" finished]\nAuth looks fine',
      );
    } finally {
      for (const turn of runtime.turns) turn.finish("cleanup");
      await service.shutdown();
    }
  });

  it("steers a running lead without ending its run", async () => {
    const { service } = await createService();
    const runtime = scriptRuntime(service);
    try {
      await service.sendSessionMessage({
        sessionId: "lead",
        messageId: "lead-task",
        content: "Coordinate the review",
      });
      const leadRunId = service.runs.activeRunId("lead");
      const { member, runId } = await spawnTeammate(service);
      (await runtime.turnFor(member.sessionId)).finish("Auth looks fine");

      const reportId = teammateReportMessageId(runId);
      await vi.waitFor(async () =>
        expect(await service.state.getMessageById(reportId)).toMatchObject({
          runId: leadRunId,
        }),
      );
      expect(service.runs.activeRunId("lead")).toBe(leadRunId);
    } finally {
      for (const turn of runtime.turns) turn.finish("cleanup");
      await service.shutdown();
    }
  });

  it("holds a report lost to a daemon crash until the lead resumes", async () => {
    const { service, root } = await createService();
    const runtime = scriptRuntime(service);
    const { member, runId } = await spawnTeammate(service);
    vi.spyOn(service.team, "onAgentEvent").mockResolvedValue();
    (await runtime.turnFor(member.sessionId)).finish("Auth looks fine");
    await vi.waitFor(() =>
      expect(service.runs.hasActiveRun(member.sessionId)).toBe(false),
    );
    await service.shutdown();

    const restarted = (await createService(root)).service;
    vi.spyOn(restarted.runtime, "sendSessionMessage").mockResolvedValue(
      assistantMessage("lead", ""),
    );
    try {
      restarted.startBackgroundRecovery();
      const reportId = teammateReportMessageId(runId);
      await vi.waitFor(async () =>
        expect(
          (await restarted.state.listQueuedAgentInputs("lead")).map(
            (input) => input.messageId,
          ),
        ).toEqual([reportId]),
      );
      expect(restarted.runs.hasActiveRun("lead")).toBe(false);
      expect(restarted.getActiveWork().queuedInputs).toBe(0);
    } finally {
      await restarted.shutdown();
    }
  });
});
