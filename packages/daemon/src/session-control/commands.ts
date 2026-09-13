export class SessionCommandQueue {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(sessionId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.pending.set(sessionId, settled);
    void settled.then(() => {
      if (this.pending.get(sessionId) === settled)
        this.pending.delete(sessionId);
    });
    return result;
  }
}
