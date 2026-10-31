import {
  buildDaemonPdfUrl,
  pathBaseName,
} from "@cocurdex/shared/internal/files";
import { describe, expect, it } from "vitest";

describe("pathBaseName", () => {
  it("handles POSIX and Windows separators", () => {
    expect(pathBaseName("/Users/me/repo/src/app.ts")).toBe("app.ts");
    expect(pathBaseName("C:\\Users\\me\\repo\\src\\app.ts")).toBe("app.ts");
    expect(pathBaseName("src/nested\\mixed.ts")).toBe("mixed.ts");
  });

  it("ignores trailing separators on folder paths", () => {
    expect(pathBaseName("C:\\Users\\me\\repo\\")).toBe("repo");
    expect(pathBaseName("/home/me/repo/")).toBe("repo");
  });

  it("returns the input when there is no segment", () => {
    expect(pathBaseName("/")).toBe("/");
    expect(pathBaseName("")).toBe("");
  });
});

describe("buildDaemonPdfUrl", () => {
  it("maps the daemon socket origin to its HTTP origin", () => {
    expect(buildDaemonPdfUrl("ws://127.0.0.1:53508", "/a b/c.pdf")).toBe(
      "http://127.0.0.1:53508/files/pdf?path=%2Fa+b%2Fc.pdf",
    );
    expect(buildDaemonPdfUrl("wss://host.ts.net", "C:\\docs\\x.pdf")).toBe(
      "https://host.ts.net/files/pdf?path=C%3A%5Cdocs%5Cx.pdf",
    );
  });
});
