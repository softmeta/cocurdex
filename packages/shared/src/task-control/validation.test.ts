import { describe, expect, it } from "vitest";
import {
  validateSendSessionCommand,
  validateSubmitPreviousMessageCommand,
} from "./validation";

describe("task message command validation", () => {
  it("requires a bounded resubmission command and explicit revert choice", () => {
    const command = {
      sessionId: "task-1",
      messageId: "message-1",
      content: "Revised",
      revertWorkspace: false,
    };
    expect(() => validateSubmitPreviousMessageCommand(command)).not.toThrow();
    expect(() =>
      validateSubmitPreviousMessageCommand({
        ...command,
        revertWorkspace: "false",
      }),
    ).toThrow("revert choice");
    expect(() =>
      validateSubmitPreviousMessageCommand({
        ...command,
        workspaceRootPath: "/untrusted",
      }),
    ).toThrow("Unexpected field");
    expect(() =>
      validateSubmitPreviousMessageCommand({
        ...command,
        messageId: "../outside",
      }),
    ).toThrow("Invalid session ID");
  });

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
  ])("rejects malformed commands: %j", (input) => {
    expect(() => validateSendSessionCommand(input)).toThrow();
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
