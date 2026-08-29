import type { ContextFileAttachment } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { splitContentByMentions } from "./chat-message-utils";

function createFile(
  filePath: string,
  startLine = 1,
  endLine = 19,
): ContextFileAttachment {
  return {
    endLine,
    filePath,
    kind: "context-file",
    language: "yaml",
    selectedText: "",
    startLine,
    surroundingContext: "",
  } as ContextFileAttachment;
}

describe("splitContentByMentions", () => {
  it("keeps a mention where the user placed it", () => {
    const attachment = createFile("/repo/.gitlab-ci.yml");
    const { leadingAttachments, segments } = splitContentByMentions(
      "fix @.gitlab-ci.yml please",
      [attachment],
    );

    expect(leadingAttachments).toEqual([]);
    expect(segments).toEqual([
      { kind: "text", text: "fix " },
      { attachment, kind: "mention" },
      { kind: "text", text: " please" },
    ]);
  });

  it("pairs repeated markers in document order", () => {
    const first = createFile("/repo/a.ts", 1, 2);
    const second = createFile("/repo/a.ts", 8, 9);
    const { segments } = splitContentByMentions("@a.ts and @a.ts", [
      first,
      second,
    ]);

    expect(segments.filter((segment) => segment.kind === "mention")).toEqual([
      { attachment: first, kind: "mention" },
      { attachment: second, kind: "mention" },
    ]);
  });

  it("falls back to leading pills when the body has no marker", () => {
    const attachment = createFile("/repo/a.ts");
    const { leadingAttachments, segments } = splitContentByMentions("hello", [
      attachment,
    ]);

    expect(leadingAttachments).toEqual([attachment]);
    expect(segments).toEqual([{ kind: "text", text: "hello" }]);
  });
});
