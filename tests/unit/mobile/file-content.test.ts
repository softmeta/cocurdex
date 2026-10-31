import { sourceLanguage } from "@cocurdex/mobile/internal/files/source-language";
import {
  FileLoadError,
  MAX_PREVIEW_BYTES,
  readFileContent,
} from "@cocurdex/mobile/internal/workspace-files/file-content";
import { describe, expect, it } from "vitest";

describe("readFileContent", () => {
  it("reads a whole small file", () => {
    expect(readFileContent(206, "bytes 0-5/6", "a\r\nb\n")).toEqual({
      kind: "text",
      text: "a\nb\n",
      lines: ["a", "b", ""],
      truncated: false,
    });
  });

  it("drops the partial last line of a truncated file", () => {
    const content = readFileContent(
      206,
      `bytes 0-${MAX_PREVIEW_BYTES - 1}/${MAX_PREVIEW_BYTES * 3}`,
      "one\ntwo\nthr\uFFFD",
    );
    expect(content).toEqual({
      kind: "text",
      text: "one\ntwo",
      lines: ["one", "two"],
      truncated: true,
    });
  });

  it("treats an empty file as empty text", () => {
    expect(readFileContent(416, "bytes */0", "")).toMatchObject({
      kind: "text",
      lines: [""],
    });
  });

  it("recognizes binary content", () => {
    expect(readFileContent(200, null, "PK\u0003\u0004\u0000")).toEqual({
      kind: "binary",
    });
  });

  it("maps refusals to their reason", () => {
    const reason = (status: number) => {
      try {
        readFileContent(status, null, "");
      } catch (error) {
        return error instanceof FileLoadError ? error.reason : null;
      }
      return null;
    };
    expect([reason(403), reason(404), reason(500)]).toEqual([
      "outside",
      "missing",
      "failed",
    ]);
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
