import { validateSendSessionCommand } from "@cocurdex/shared/internal/task-control/validation";
import { describe, expect, it } from "vitest";

describe("task message command validation", () => {
  it.each([
    "session",
    "workspaceRootPath",
    "workspaceRootPaths",
    "providerConfig",
  ])("rejects client-supplied %s", (field) => {
    expect(() =>
      validateSendSessionCommand({
        sessionId: "task-1",
        content: "Run",
        [field]: "forged",
      }),
    ).toThrow("Unexpected field");
  });

  it.each([
    null,
    [],
    {},
    { sessionId: "task-1", content: "" },
    { sessionId: "../escape", content: "Run" },
    { sessionId: "task-1", content: "Run", delivery: "invalid" },
    { sessionId: "task-1", content: "Run", attachments: {} },
    {
      sessionId: "task-1",
      content: "Run",
      attachments: [
        {
          kind: "context-item",
          itemKind: "doc",
          id: "n1",
          title: "",
          body: "",
        },
      ],
    },
  ])("rejects malformed commands: %j", (input) => {
    expect(() => validateSendSessionCommand(input)).toThrow();
  });

  it("requires a client-generated message ID for idempotent retries", () => {
    expect(() =>
      validateSendSessionCommand({ sessionId: "task-1", content: "Run" }),
    ).toThrow("Invalid message ID");
  });

  it("accepts a note-only message", () => {
    expect(() =>
      validateSendSessionCommand({
        sessionId: "task-1",
        messageId: "message-1",
        content: "",
        attachments: [
          {
            kind: "context-item",
            itemKind: "note",
            id: "n1",
            title: "Plan",
            body: "# Goal",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts an image-only message and the complete reasoning effort ladder", () => {
    for (const thinkingLevel of [
      "default",
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]) {
      expect(() =>
        validateSendSessionCommand({
          sessionId: "task-1",
          messageId: "message-1",
          content: "",
          thinkingLevel,
          attachments: [
            {
              kind: "image",
              id: "image-1",
              name: "Image",
              filePath: "/tmp/image.png",
              mimeType: "image/png",
              sizeBytes: 100,
              width: 20,
              height: 20,
            },
          ],
        }),
      ).not.toThrow();
    }
  });
});
