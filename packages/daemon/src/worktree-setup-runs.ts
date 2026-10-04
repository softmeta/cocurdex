import {
  type AgentEvent,
  type AgentToolCallRecord,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";

interface SetupRun {
  script: string;
  output: Promise<string>;
}

const MAX_ERROR_LENGTH = 4000;

export class WorktreeSetupRuns {
  private readonly runs = new Map<string, SetupRun>();

  start(worktreePath: string, script: string, run: () => Promise<string>) {
    const output = run();
    const entry = { script, output };
    this.runs.set(worktreePath, entry);
    output.then(
      () => this.forget(worktreePath, entry),
      () => undefined,
    );
  }

  get(worktreePath: string) {
    return this.runs.get(worktreePath);
  }

  async wait(worktreePath: string) {
    const entry = this.runs.get(worktreePath);
    if (!entry) {
      return "";
    }
    try {
      return await entry.output;
    } catch (error) {
      this.forget(worktreePath, entry);
      throw error;
    }
  }

  private forget(worktreePath: string, entry: SetupRun) {
    if (this.runs.get(worktreePath) === entry) {
      this.runs.delete(worktreePath);
    }
  }
}

export async function waitForWorktreeSetup(input: {
  runs: WorktreeSetupRuns;
  sessionId: string;
  worktreePath: string;
  cancelled: Promise<void>;
  emit(event: AgentEvent): void;
}): Promise<void> {
  const entry = input.runs.get(input.worktreePath);
  if (!entry) {
    return;
  }
  const startedAt = new Date().toISOString();
  const toolCall: AgentToolCallRecord = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    title: "Prepare worktree",
    kind: WORKTREE_SETUP_TOOL_KIND,
    status: "in_progress",
    content: [],
    rawInput: { command: entry.script },
    locations: [],
    startedAt,
    updatedAt: startedAt,
  };
  input.emit({ type: "tool.started", sessionId: input.sessionId, toolCall });
  const finish = (status: "completed" | "failed", text: string) => {
    input.emit({
      type: "tool.finished",
      sessionId: input.sessionId,
      toolCall: {
        ...toolCall,
        status,
        content: text ? [{ type: "text", text }] : [],
        updatedAt: new Date().toISOString(),
      },
    });
  };

  try {
    const output = await Promise.race([
      input.runs.wait(input.worktreePath),
      input.cancelled.then(() => null),
    ]);
    if (output === null) {
      finish("failed", "");
      return;
    }
    finish("completed", output.trim());
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(-MAX_ERROR_LENGTH);
    finish("failed", message);
    throw new Error(
      `Worktree setup script failed in ${input.worktreePath}. Fix the worktree, then send again to continue without it.\n\n${message}`,
    );
  }
}
