import { randomUUID } from "node:crypto";
import type { ChatWindowTransfer } from "../../src/lib/chat-window-types";

export class ChatWindowHandoff {
  private pending: {
    transfer: ChatWindowTransfer;
    target: number;
    resolve(): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  get busy() {
    return this.pending !== null;
  }

  forTarget(target: number) {
    return this.pending?.target === target ? this.pending.transfer : null;
  }

  begin(target: number, snapshot: string) {
    if (this.pending)
      throw new Error("A chat window transfer is already in progress");
    const transfer = { id: randomUUID(), snapshot };
    const completion = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancel(new Error("The chat window did not become ready in time"));
      }, 30_000);
      this.pending = { transfer, target, resolve, reject, timer };
    });
    return { transfer, completion };
  }

  complete(target: number, id: string) {
    const pending = this.pending;
    if (!pending || pending.target !== target || pending.transfer.id !== id) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pending = null;
    pending.resolve();
    return true;
  }

  cancel(error: Error) {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;
    pending.reject(error);
  }
}
