interface AdmissionWaiter {
  resolve(): void;
  reject(error: Error): void;
}

export class RunAdmissionQueue {
  private readonly order: string[] = [];
  private readonly waiters = new Map<string, AdmissionWaiter[]>();

  enqueue(sessionId: string) {
    if (!this.order.includes(sessionId)) this.order.push(sessionId);
  }

  isWaiting(sessionId: string) {
    return this.order.includes(sessionId);
  }

  waiting(): readonly string[] {
    return [...this.order];
  }

  whenAdmitted(sessionId: string): Promise<void> {
    if (!this.isWaiting(sessionId)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.waiters.set(sessionId, [
        ...(this.waiters.get(sessionId) ?? []),
        { resolve, reject },
      ]);
    });
  }

  admitted(sessionId: string) {
    for (const waiter of this.release(sessionId)) waiter.resolve();
  }

  cancel(sessionId: string, reason: Error) {
    for (const waiter of this.release(sessionId)) waiter.reject(reason);
  }

  cancelAll(reason: Error) {
    for (const sessionId of this.waiting()) this.cancel(sessionId, reason);
  }

  private release(sessionId: string) {
    const index = this.order.indexOf(sessionId);
    if (index >= 0) this.order.splice(index, 1);
    const waiters = this.waiters.get(sessionId) ?? [];
    this.waiters.delete(sessionId);
    return waiters;
  }
}
