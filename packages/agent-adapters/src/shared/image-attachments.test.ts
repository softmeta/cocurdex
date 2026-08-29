import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ImageAttachment } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { buildClaudeUserContent } from "../claude-shared/claude-user-content";
import { buildInput } from "../codex/codex-app-server-events";
import { buildPromptParts } from "../opencode/opencode-events";

function createImageAttachment(): ImageAttachment {
  const directory = path.join(tmpdir(), "cocurdex-test-images");
  mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "pixel.png");
  writeFileSync(filePath, Buffer.from("image-bytes"));

  return {
    filePath,
    height: 1,
    id: "img-1",
    kind: "image",
    mimeType: "image/png",
    name: "pixel.png",
    sizeBytes: 11,
    width: 1,
  };
}

describe("native image attachments", () => {
  it("maps images to Codex localImage input items", () => {
    const image = createImageAttachment();

    expect(buildInput("What is this?", [image])).toEqual([
      {
        text: expect.stringContaining("What is this?"),
        type: "text",
      },
      {
        path: image.filePath,
        type: "localImage",
      },
    ]);
  });

  it("maps images to OpenCode file parts with data URLs", () => {
    const image = createImageAttachment();

    expect(buildPromptParts("What is this?", [image])).toEqual([
      {
        text: expect.stringContaining("What is this?"),
        type: "text",
      },
      {
        filename: "pixel.png",
        mime: "image/png",
        type: "file",
        url: `data:image/png;base64,${Buffer.from("image-bytes").toString(
          "base64",
        )}`,
      },
    ]);
  });

  it("maps images to Claude base64 image blocks", () => {
    const image = createImageAttachment();

    expect(buildClaudeUserContent("What is this?", [image]).content).toEqual([
      {
        source: {
          data: Buffer.from("image-bytes").toString("base64"),
          media_type: "image/png",
          type: "base64",
        },
        type: "image",
      },
      {
        text: "What is this?",
        type: "text",
      },
    ]);
  });

  it("keeps unsupported Claude image media types as a text summary", () => {
    const image = { ...createImageAttachment(), mimeType: "image/bmp" };
    const { content } = buildClaudeUserContent("What is this?", [image]);

    expect(typeof content).toBe("string");
    expect(content).toContain("image/bmp");
  });

  it("sends plain text to Claude when there are no images", () => {
    expect(buildClaudeUserContent("Hello", []).content).toBe("Hello");
  });
});
