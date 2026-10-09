import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import { describe, expect, it, vi } from "vitest";
import { createClaudeOnUserDialog } from "./claude-user-dialog";

function createPayload(answer: string | null) {
  const requestQuestion = vi.fn(async () => answer);
  const payload = {
    session: { id: "session-1", agentType: "claude-agent" },
    requestQuestion,
  } as unknown as CreateAgentSessionPayload;
  return { payload, requestQuestion };
}

const resumeRequest = {
  dialogKind: "resume_return",
  payload: { sessionAgeMinutes: 192, estimatedTokens: 240_000 },
};
const dialogOptions = {
  requestId: "request-1",
  signal: new AbortController().signal,
};

describe("createClaudeOnUserDialog", () => {
  it.each([
    ["Compact and continue", "compact"],
    ["Keep full history", "continue"],
    ["Never ask again", "never"],
  ])("maps the %s answer to %s", async (answer, result) => {
    const { payload } = createPayload(answer);

    await expect(
      createClaudeOnUserDialog(payload)(resumeRequest, dialogOptions),
    ).resolves.toEqual({ behavior: "completed", result });
  });

  it("states the idle time and history size in the question", async () => {
    const { payload, requestQuestion } = createPayload("Keep full history");

    await createClaudeOnUserDialog(payload)(resumeRequest, dialogOptions);

    expect(requestQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.stringMatching(/3h 12m.*240k tokens/),
      }),
    );
  });

  it("cancels on a free-form answer so Claude Code keeps its default", async () => {
    const { payload } = createPayload("maybe later");

    await expect(
      createClaudeOnUserDialog(payload)(resumeRequest, dialogOptions),
    ).resolves.toEqual({ behavior: "cancelled" });
  });

  it("cancels dialog kinds it does not render without asking", async () => {
    const { payload, requestQuestion } = createPayload("Keep full history");

    await expect(
      createClaudeOnUserDialog(payload)(
        { dialogKind: "newer_model_offer", payload: {} },
        dialogOptions,
      ),
    ).resolves.toEqual({ behavior: "cancelled" });
    expect(requestQuestion).not.toHaveBeenCalled();
  });
});
