import { sourceLanguage } from "@cocurdex/mobile/internal/files/source-language";
import {
  fileLoadFailure,
  MAX_PREVIEW_BYTES,
  readFileContent,
} from "@cocurdex/mobile/internal/workspace-files/file-content";
import { describe, expect, it } from "vitest";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readFileContent", () => {
  it("reads a whole small file", () => {
    expect(readFileContent(bytes("a\r\nb\n"), 5)).toEqual({
      kind: "text",
      text: "a\nb\n",
      lines: ["a", "b", ""],
      truncated: false,
    });
  });

  it("drops the partial last line of a truncated file", () => {
    const head = bytes("one\ntwo\nthr\u00e9");
    const content = readFileContent(
      head.subarray(0, -1),
      MAX_PREVIEW_BYTES * 3,
    );
    expect(content).toEqual({
      kind: "text",
      text: "one\ntwo",
      lines: ["one", "two"],
      truncated: true,
    });
  });

  it("treats an empty file as empty text", () => {
    expect(readFileContent(new Uint8Array(0), 0)).toMatchObject({
      kind: "text",
      lines: [""],
    });
  });

  it("recognizes binary content", () => {
    expect(readFileContent(bytes("PK\u0003\u0004\u0000"), 5)).toEqual({
      kind: "binary",
    });
  });

  it("maps refusals to their reason", () => {
    expect(
      (["forbidden", "notFound", "unreachable"] as const).map(fileLoadFailure),
    ).toEqual(["outside", "missing", "failed"]);
  });
});

describe("sourceLanguage", () => {
  it("maps extensions and well-known file names", () => {
    expect(sourceLanguage("cart.TS")).toBe("typescript");
    expect(sourceLanguage("Dockerfile")).toBe("dockerfile");
    expect(sourceLanguage("README.md")).toBe("markdown");
    expect(sourceLanguage("LICENSE")).toBeNull();
  });
});
