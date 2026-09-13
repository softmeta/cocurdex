import type { DaemonActiveWork } from "@cocurdex/rpc";
import { describe, expect, it } from "vitest";
import { DaemonShutdownGate } from "./daemon-shutdown-gate";

const idle: DaemonActiveWork = {
  agentTurns: 0,
  queuedInputs: 0,
  chatOperations: 0,
  workflowActive: false,
};

describe("safe daemon shutdown admission", () => {
  it.each([
    "agentTurns",
    "queuedInputs",
    "chatOperations",
    "workflowActive",
  ] as const)("preserves %s", (kind) => {
    const gate = new DaemonShutdownGate();
    expect(
      gate.prepare({ ...idle, [kind]: kind === "workflowActive" ? true : 1 })
        .status,
    ).toBe("busy");
  });
  it("counts accepted requests until their work settles, then atomically rejects new work", async () => {
    const gate = new DaemonShutdownGate();
    let settle!: () => void;
    const pending = gate.run(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    expect(gate.prepare(idle)).toMatchObject({
      status: "busy",
      activeRequests: 1,
    });
    settle();
    await pending;
    expect(gate.prepare(idle).status).toBe("accepted");
    await expect(gate.run(async () => "new work")).rejects.toThrow(
      "not accepted",
    );
  });
  it("releases request accounting on failure", async () => {
    const gate = new DaemonShutdownGate();
    await expect(
      gate.run(async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(gate.prepare(idle).status).toBe("accepted");
  });
});
