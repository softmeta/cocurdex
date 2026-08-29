import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DocumentAttachment } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { buildAcpPrompt } from "../acp/acp-mappers";
import { buildClaudeUserContent } from "../claude-shared/claude-user-content";
import { buildInput } from "../codex/codex-app-server-events";
import { buildPromptParts } from "../opencode/opencode-events";

function createDocumentAttachment(): DocumentAttachment {
  const directory = path.join(tmpdir(), "cocurdex-test-documents");
  mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "sample.pdf");
  writeFileSync(filePath, Buffer.from("%PDF-1.7\ntest-document"));

  return {
    filePath,
    id: "doc-1",
    kind: "document",
    mimeType: "application/pdf",
    name: "sample.pdf",
    sizeBytes: 22,
  };
}

const acpCapabilities = {
  loadSession: true,
  prompt: {
    audio: false,
    embeddedContext: true,
    image: true,
  },
  protocol: { kind: "acp" as const, version: 1 },
  resumeSession: true,
};

describe("native document attachments", () => {
  it("maps PDFs to Claude base64 document blocks", () => {
    const document = createDocumentAttachment();

    expect(
      buildClaudeUserContent("Summarize this PDF", [document]).content,
    ).toEqual([
      {
        source: {
          data: Buffer.from("%PDF-1.7\ntest-document").toString("base64"),
          media_type: "application/pdf",
          type: "base64",
        },
        type: "document",
      },
      {
        text: "Summarize this PDF",
        type: "text",
      },
    ]);
  });

  it("maps PDFs to OpenCode file parts", () => {
    const document = createDocumentAttachment();

    expect(buildPromptParts("Summarize this PDF", [document])).toEqual([
      { text: "Summarize this PDF", type: "text" },
      {
        filename: "sample.pdf",
        mime: "application/pdf",
        type: "file",
        url: `data:application/pdf;base64,${Buffer.from(
          "%PDF-1.7\ntest-document",
        ).toString("base64")}`,
      },
    ]);
  });

  it("embeds PDFs in ACP prompts when embedded context is negotiated", async () => {
    const document = createDocumentAttachment();

    await expect(
      buildAcpPrompt("Summarize this PDF", [document], acpCapabilities),
    ).resolves.toEqual([
      { text: "Summarize this PDF", type: "text" },
      {
        resource: {
          blob: Buffer.from("%PDF-1.7\ntest-document").toString("base64"),
          mimeType: "application/pdf",
          uri: expect.stringMatching(/^file:\/\//u),
        },
        type: "resource",
      },
    ]);
  });

  it("uses baseline ACP resource links without embedded context", async () => {
    const document = createDocumentAttachment();

    await expect(
      buildAcpPrompt("Summarize this PDF", [document], {
        ...acpCapabilities,
        prompt: { ...acpCapabilities.prompt, embeddedContext: false },
      }),
    ).resolves.toEqual([
      { text: "Summarize this PDF", type: "text" },
      {
        mimeType: "application/pdf",
        name: "sample.pdf",
        size: 22,
        type: "resource_link",
        uri: expect.stringMatching(/^file:\/\//u),
      },
    ]);
  });

  it("rejects PDFs at the Codex adapter boundary", () => {
    const document = createDocumentAttachment();

    expect(() => buildInput("Summarize this PDF", [document])).toThrow(
      "Codex does not support document attachments",
    );
  });
});
