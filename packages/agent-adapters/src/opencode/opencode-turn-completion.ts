export class OpenCodeTurnCompletion {
  private active:
    | {
        promise: Promise<void>;
        requestId: string;
        resolve: () => void;
      }
    | undefined;

  begin(requestId: string): Promise<void> {
    if (this.active) {
      throw new Error("OpenCode already has an active turn");
    }

    let resolve = () => {};
    const promise = new Promise<void>((nextResolve) => {
      resolve = nextResolve;
    });
    this.active = { promise, requestId, resolve };
    return promise;
  }

  settle(requestId?: string) {
    if (!this.active || (requestId && this.active.requestId !== requestId)) {
      return;
    }

    const { resolve } = this.active;
    this.active = undefined;
    resolve();
  }
}
