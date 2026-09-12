import type { DaemonActiveWork, DaemonShutdownResult } from "@cocurdex/rpc";

export class DaemonShutdownGate {
  private activeRequests = 0;
  private draining = false;

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.draining)
      throw new Error("Daemon is shutting down; request was not accepted");
    this.activeRequests += 1;
    try {
      return await operation();
    } finally {
      this.activeRequests -= 1;
    }
  }

  prepare(activeWork: DaemonActiveWork): DaemonShutdownResult {
    const busy =
      this.activeRequests > 0 ||
      activeWork.agentTurns > 0 ||
      activeWork.queuedInputs > 0 ||
      activeWork.chatOperations > 0 ||
      activeWork.workflowActive;
    if (!busy) this.draining = true;
    return {
      status: busy ? "busy" : "accepted",
      activeRequests: this.activeRequests,
      activeWork,
    };
  }
}
