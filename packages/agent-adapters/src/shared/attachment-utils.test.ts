import type { ContextFileAttachment, ImageAttachment } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  buildTextWithContextAttachments,
  formatContextFileAttachments,
  formatContextFolderAttachments,
  formatImageAttachmentSummary,
} from "./attachment-utils";

function createContextFile(
  overrides: Partial<ContextFileAttachment> = {},
): ContextFileAttachment {
  return {
    filePath: "/repo/src/app.ts",
    language: "ts",
    selectedText: "const answer = 42;",
    startLine: 9,
    endLine: 15,
    surroundingContext: "",
    ...overrides,
  };
}

describe("formatContextFileAttachments", () => {
  it("formats the selection with a Sidekick-style source marker", () => {
    const text = formatContextFileAttachments([createContextFile()]);

    expect(text).toContain("@/repo/src/app.ts :L9-L15");
    expect(text).toContain(
      '<context_file path="/repo/src/app.ts" language="ts" start_line="9" end_line="15">',
    );
    expect(text).toContain("<![CDATA[\nconst answer = 42;\n]]>");
  });

  it("includes column range when selection columns are available", () => {
    const text = formatContextFileAttachments([
      createContextFile({
        endColumn: 18,
        endLine: 9,
        startColumn: 3,
        startLine: 9,
      }),
    ]);

    expect(text).toContain("@/repo/src/app.ts :L9:C3-C17");
    expect(text).toContain('start_column="3" end_column="17"');
  });

  it("includes multi-line column range when selection columns are available", () => {
    const text = formatContextFileAttachments([
      createContextFile({
        endColumn: 8,
        endLine: 15,
        startColumn: 3,
        startLine: 9,
      }),
    ]);

    expect(text).toContain("@/repo/src/app.ts :L9:C3-L15:C7");
    expect(text).toContain('start_column="3" end_column="7"');
  });

  it("falls back to surrounding context when no text is selected", () => {
    const text = formatContextFileAttachments([
      createContextFile({ selectedText: "", surroundingContext: "context" }),
    ]);

    expect(text).toContain("\ncontext\n");
  });

  it("removes shared indentation from selected code", () => {
    const text = formatContextFileAttachments([
      createContextFile({
        selectedText: "    if (enabled) {\n      run();\n    }",
      }),
    ]);

    expect(text).toContain("<![CDATA[\nif (enabled) {\n  run();\n}\n]]>");
  });

  it("preserves markdown code fences in CDATA", () => {
    const body = "```js\nconsole.log(1);\n```";
    const text = formatContextFileAttachments([
      createContextFile({ selectedText: body }),
    ]);

    expect(text).toContain(`<![CDATA[\n${body}\n]]>`);
  });

  it("keeps CDATA valid when selected code contains a CDATA close marker", () => {
    const text = formatContextFileAttachments([
      createContextFile({ selectedText: "const end = ']]>';" }),
    ]);

    expect(text).toContain("const end = ']]]]><![CDATA[>';");
  });

  it("emits a path-only marker so the agent can read the file", () => {
    const text = formatContextFileAttachments([
      createContextFile({
        contentOmitted: true,
        filePath: "/repo/testdata.json",
        language: "json",
        selectedText: "",
        surroundingContext: "",
      }),
    ]);

    expect(text).toContain("@/repo/testdata.json");
    expect(text).not.toContain(":L");
    expect(text).toContain(
      '<context_file path="/repo/testdata.json" language="json" omitted="true" />',
    );
    expect(text).not.toContain("<![CDATA[");
  });
});

describe("buildTextWithContextAttachments", () => {
  it("puts user text after context attachments so it reads as the instruction", () => {
    const text = buildTextWithContextAttachments("Explain this", [
      { kind: "context-file", ...createContextFile() },
    ]);

    expect(text.indexOf("@/repo/src/app.ts :L9-L15")).toBeLessThan(
      text.indexOf("Explain this"),
    );
    expect(text.trimEnd().endsWith("Explain this")).toBe(true);
  });

  it("carries the local image path so agents without native image support can read it", () => {
    const image: ImageAttachment = {
      filePath: "/private/var/folders/secret/image.png",
      height: 100,
      id: "image-1",
      kind: "image",
      mimeType: "image/png",
      name: "image.png",
      sizeBytes: 42,
      width: 100,
    };

    const text = buildTextWithContextAttachments("Explain this", [image]);

    expect(text).toContain("Image: image.png");
    expect(text).toContain(image.filePath);
    expect(formatImageAttachmentSummary(image)).toContain(image.filePath);
  });

  it("can omit image summaries when the native image content is sent separately", () => {
    const image: ImageAttachment = {
      filePath: "/private/var/folders/secret/image.png",
      height: 100,
      id: "image-1",
      kind: "image",
      mimeType: "image/png",
      name: "image.png",
      sizeBytes: 42,
      width: 100,
    };

    const text = buildTextWithContextAttachments("Explain this", [image], {
      includeImageSummaries: false,
    });

    expect(text).toBe("Explain this");
  });
});

describe("formatContextFolderAttachments", () => {
  it("emits a self-closing folder tag with the path", () => {
    const text = formatContextFolderAttachments([
      { folderPath: "/repo/src", kind: "context-folder" },
    ]);

    expect(text).toContain('<context_folder path="/repo/src" />');
  });
});
