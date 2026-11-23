import type { SessionUpdate } from "@agentclientprotocol/sdk/unstable";

export interface AcpDetachedReplyProtocol {
  /** Id of work this root update starts that reports back with its own reply after the prompt returns. */
  readDetachedWorkId(update: SessionUpdate): string | null;
  /** True for the update that closes every model reply, including the ones the agent starts itself. */
  endsReply(update: SessionUpdate): boolean;
}

export type AcpDetachedReplyOutcome = "settled" | "cancelled";

export interface AcpDetachedReplyTimings {
  settleDebounceMs: number;
  quietLimitMs: number;
}

const DEFAULT_TIMINGS: AcpDetachedReplyTimings = {
  settleDebounceMs: 3_000,
  quietLimitMs: 10 * 60_000,
};

const REPLY_CONTENT_UPDATES = new Set<SessionUpdate["sessionUpdate"]>([
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
]);

type Phase =
  | { kind: "idle" }
  | { kind: "prompting" }
  | {
      kind: "waiting";
      finish: (outcome: AcpDetachedReplyOutcome) => void;
    };

/**
 * Tracks replies an agent streams on its root session after `session/prompt`
 * has returned, such as Antigravity waking its main agent each time an
 * `invoke_subagent` worker reports back. A prompt that started such work stays
 * open until every worker has been answered; a reply that arrives with no turn
 * open becomes a continuation the adapter completes on its own.
 */
export class AcpDetachedReplies {
  private phase: Phase = { kind: "idle" };
  private readonly workIds = new Set<string>();
  private finishedReplies = 0;
  private replyOpen = false;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly protocol: AcpDetachedReplyProtocol,
    private readonly continuation: {
      start(): void;
      end(outcome: AcpDetachedReplyOutcome): void;
    },
    private readonly timings: AcpDetachedReplyTimings = DEFAULT_TIMINGS,
  ) {}

  beginTurn() {
    this.clearTimers();
    this.phase = { kind: "prompting" };
    this.resetCounts();
  }

  /** Resolves once every detached worker has been answered or the agent went quiet. */
  afterPrompt(): Promise<AcpDetachedReplyOutcome> {
    if (this.phase.kind !== "prompting" || this.workIds.size === 0) {
      this.phase = { kind: "idle" };
      return Promise.resolve("settled");
    }
    this.finishedReplies = 0;
    this.replyOpen = false;
    return new Promise((resolve) => {
      this.phase = { kind: "waiting", finish: resolve };
      this.armQuietTimer();
    });
  }

  observe(update: SessionUpdate) {
    const workId = this.protocol.readDetachedWorkId(update);
    if (workId) {
      this.workIds.add(workId);
    }
    if (this.phase.kind === "prompting") {
      return;
    }
    const isContent = REPLY_CONTENT_UPDATES.has(update.sessionUpdate);
    if (this.phase.kind === "idle") {
      if (!isContent) {
        return;
      }
      this.resetCounts();
      this.phase = {
        kind: "waiting",
        finish: (outcome) => this.continuation.end(outcome),
      };
      this.continuation.start();
    }
    this.armQuietTimer();
    if (isContent) {
      this.replyOpen = true;
      this.clearSettleTimer();
      return;
    }
    if (this.protocol.endsReply(update) && this.replyOpen) {
      this.replyOpen = false;
      this.finishedReplies += 1;
      this.scheduleSettle();
    }
  }

  release(outcome: AcpDetachedReplyOutcome) {
    const phase = this.phase;
    this.clearTimers();
    this.phase = { kind: "idle" };
    if (phase.kind === "waiting") {
      phase.finish(outcome);
    }
  }

  private resetCounts() {
    this.workIds.clear();
    this.finishedReplies = 0;
    this.replyOpen = false;
  }

  private scheduleSettle() {
    this.clearSettleTimer();
    if (this.replyOpen || this.finishedReplies < this.workIds.size) {
      return;
    }
    this.settleTimer = setTimeout(
      () => this.release("settled"),
      this.timings.settleDebounceMs,
    );
    this.settleTimer.unref?.();
  }

  private armQuietTimer() {
    if (this.quietTimer) {
      clearTimeout(this.quietTimer);
    }
    this.quietTimer = setTimeout(
      () => this.release("settled"),
      this.timings.quietLimitMs,
    );
    this.quietTimer.unref?.();
  }

  private clearSettleTimer() {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = undefined;
    }
  }

  private clearTimers() {
    this.clearSettleTimer();
    if (this.quietTimer) {
      clearTimeout(this.quietTimer);
      this.quietTimer = undefined;
    }
  }
}
