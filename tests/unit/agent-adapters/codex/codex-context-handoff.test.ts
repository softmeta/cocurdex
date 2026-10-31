import { prepareCodexTurnContent } from "@cocurdex/agent-adapters/internal/codex/codex-context-handoff";
import { describe, expect, it, vi } from "vitest";

const handoff = {
  text: "<cocurdex_context_handoff>…</cocurdex_context_handoff>",
  preamble: "Other agents worked on this session before you joined.",
  entries: [
    { role: "user" as const, text: "[#1 User · item=u1]\nfix it" },
    { role: "assistant" as const, text: "[#2 Assistant (pi) · item=a1]\ndone" },
  ],
};

describe("prepareCodexTurnContent", () => {
  it("injects the handoff as thread history and keeps the prompt plain", async () => {
    const injectItems = vi.fn(async () => undefined);
    const content = await prepareCodexTurnContent(
      { injectItems },
      "thread-1",
      "next",
      handoff,
    );
    expect(content).toBe("next");
    expect(injectItems).toHaveBeenCalledWith({
      threadId: "thread-1",
      items: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: handoff.preamble }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: handoff.entries[0]?.text }],
        },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: handoff.entries[1]?.text }],
        },
      ],
    });
  });

  it("falls back to prefixing the prompt when the app-server rejects injection", async () => {
    const content = await prepareCodexTurnContent(
      {
        injectItems: async () => Promise.reject(new Error("Method not found")),
      },
      "thread-1",
      "next",
      handoff,
    );
    expect(content).toBe(`${handoff.text}\n\nnext`);
  });
});
