import { describe, expect, it } from "vitest";
import { buildContextFileAttachment } from "./context-file-attachment";

describe("buildContextFileAttachment", () => {
  it("attaches a whole file as a path without inlining contents", () => {
    const attachment = buildContextFileAttachment("/repo/testdata.json");

    expect(attachment.contentOmitted).toBe(true);
    expect(attachment.filePath).toBe("/repo/testdata.json");
    expect(attachment.language).toBe("json");
    expect(attachment.selectedText).toBe("");
    expect(attachment.surroundingContext).toBe("");
  });
});
