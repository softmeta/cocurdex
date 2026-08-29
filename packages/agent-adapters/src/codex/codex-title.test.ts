import { describe, expect, it, vi } from "vitest";
import { createCodexConversationTitleGenerator } from "./codex-title";

describe("createCodexConversationTitleGenerator", () => {
  it("returns a normalized title from an ephemeral Codex result", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ title: '  "修复会话重连失败"  ' }));
    const generateTitle = createCodexConversationTitleGenerator({ run });

    const title = await generateTitle({
      cwd: "/workspace",
      message: "请排查会话重连失败的问题",
      model: "gpt-5.6-luna",
    });

    expect(run).toHaveBeenCalledWith({
      cwd: "/workspace",
      message: "请排查会话重连失败的问题",
      model: "gpt-5.6-luna",
    });
    expect(title).toBe("修复会话重连失败");
  });
});
