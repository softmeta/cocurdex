import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

export class ClaudeQueryPromptQueue implements AsyncIterable<SDKUserMessage> {
  private readonly items: SDKUserMessage[] = [];
  private readonly waiters: Array<
    (result: IteratorResult<SDKUserMessage>) => void
  > = [];
  private closed = false;

  push(message: SDKUserMessage) {
    if (this.closed) {
      throw new Error("Claude query prompt queue is closed");
    }

    const resolve = this.waiters.shift();
    if (resolve) {
      resolve({ done: false, value: message });
      return;
    }

    this.items.push(message);
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ done: true, value: undefined });
    }
  }

  async next(): Promise<IteratorResult<SDKUserMessage>> {
    const message = this.items.shift();
    if (message) {
      return { done: false, value: message };
    }

    if (this.closed) {
      return { done: true, value: undefined };
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async return(): Promise<IteratorResult<SDKUserMessage>> {
    this.close();
    return { done: true, value: undefined };
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
