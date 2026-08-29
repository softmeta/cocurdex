import { describe, expect, it } from "vitest";
import { isIgnoredWorkspacePath } from "./ignore-policy";

describe("isIgnoredWorkspacePath", () => {
  it("filters Office lock files and known transient names", () => {
    expect(isIgnoredWorkspacePath("~$budget.xlsx")).toBe(true);
    expect(isIgnoredWorkspacePath("docs/~$notes.docx")).toBe(true);
    expect(isIgnoredWorkspacePath(".~lock.sheet.xlsx#")).toBe(true);
    expect(isIgnoredWorkspacePath(".DS_Store")).toBe(true);
    expect(isIgnoredWorkspacePath("Thumbs.db")).toBe(true);
  });

  it("filters ignored directories anywhere in the path", () => {
    expect(isIgnoredWorkspacePath("node_modules/lodash/index.js")).toBe(true);
    expect(isIgnoredWorkspacePath("apps/web/.next/cache")).toBe(true);
    expect(isIgnoredWorkspacePath(".git/HEAD")).toBe(true);
  });

  it("keeps ordinary workspace files", () => {
    expect(isIgnoredWorkspacePath("src/index.ts")).toBe(false);
    expect(isIgnoredWorkspacePath("notes/spec.docx")).toBe(false);
    expect(isIgnoredWorkspacePath("budget.xlsx")).toBe(false);
  });
});
