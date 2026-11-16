import {
  entityRefFromArgv,
  entityRefFromDeepLink,
} from "@desktop/electron/deep-link/deep-link";
import { describe, expect, it } from "vitest";

const NOTE_ID = "9ef30a28-f4c8-48dc-8417-e0132c5c7a8c";

describe("entityRefFromDeepLink", () => {
  it("accepts a scheme the OS reports in another case", () => {
    expect(entityRefFromDeepLink(`COCURDEX://note/${NOTE_ID}`)).toEqual({
      kind: "note",
      id: NOTE_ID,
    });
  });

  it("rejects unknown kinds and nested paths", () => {
    expect(entityRefFromDeepLink("cocurdex://workspace/abc")).toBeNull();
    expect(entityRefFromDeepLink("cocurdex://note/a/b")).toBeNull();
    expect(entityRefFromDeepLink(`note:${NOTE_ID}`)).toBeNull();
  });
});

describe("entityRefFromArgv", () => {
  it("finds the URL Windows appends after Chromium switches", () => {
    expect(
      entityRefFromArgv([
        "C:\\Program Files\\Cocurdex\\Cocurdex.exe",
        "--allow-file-access-from-files",
        `cocurdex://issue/${NOTE_ID}`,
      ]),
    ).toEqual({ kind: "issue", id: NOTE_ID });
  });

  it("ignores a launch without a deep link", () => {
    expect(entityRefFromArgv(["Cocurdex", "--open-folder", "/w"])).toBeNull();
  });
});
