export interface WorkflowWorkerDrainTarget {
  runNext(): Promise<{ status: string }>;
}

export interface WorkflowWorkerSchedulerOptions {
  concurrency: number;
}

export class WorkflowWorkerScheduler {
  private drainPromise: Promise<void> | null = null;
  private closed = false;
  private readonly concurrency: number;

  constructor(
    private readonly worker: WorkflowWorkerDrainTarget,
    options: WorkflowWorkerSchedulerOptions = { concurrency: 1 },
  ) {
    this.concurrency = Math.max(
      1,
      Math.min(32, Math.floor(options.concurrency)),
    );
  }

  wake(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (!this.drainPromise) {
      this.drainPromise = Promise.all(
        Array.from({ length: this.concurrency }, () => this.drainLane()),
      )
        .then(() => undefined)
        .finally(() => {
          this.drainPromise = null;
        });
    }
    return this.drainPromise;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.drainPromise;
  }

  private async drainLane(): Promise<void> {
    while (!this.closed) {
      const result = await this.worker.runNext();
      if (result.status === "idle") return;
    }
  }
}
