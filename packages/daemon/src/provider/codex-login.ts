import {
  cancelCodexLogin,
  startCodexChatGptLogin,
} from "@cocurdex/agent-adapters";
import type {
  CodexLoginOutcome,
  CodexLoginStartResult,
} from "@cocurdex/shared";

export class CodexLoginSessions {
  private readonly outcomes = new Map<string, Promise<CodexLoginOutcome>>();

  async start(): Promise<CodexLoginStartResult> {
    let resolveOutcome!: (outcome: CodexLoginOutcome) => void;
    const outcome = new Promise<CodexLoginOutcome>((resolve) => {
      resolveOutcome = resolve;
    });
    const started = await startCodexChatGptLogin(resolveOutcome);
    this.outcomes.set(started.loginId, outcome);
    return started;
  }

  async wait(loginId: string): Promise<CodexLoginOutcome> {
    const outcome = this.outcomes.get(loginId);
    if (!outcome) {
      return { success: false, error: "Unknown login attempt" };
    }
    try {
      return await outcome;
    } finally {
      this.outcomes.delete(loginId);
    }
  }

  cancel(loginId: string) {
    return cancelCodexLogin(loginId);
  }
}
