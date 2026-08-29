import { describe, expect, it } from "vitest";
import { extractSlashQuery } from "@/features/composer/slash-command-menu";

describe("extractSlashQuery", () => {
  it("opens on a bare leading-slash token", () => {
    expect(extractSlashQuery("/")).toBe("");
    expect(extractSlashQuery("/rev")).toBe("rev");
    expect(extractSlashQuery("/skill:foo")).toBe("skill:foo");
  });

  it("closes once an argument (space) is typed", () => {
    expect(extractSlashQuery("/review foo")).toBeNull();
    expect(extractSlashQuery("/rev ")).toBeNull();
  });

  it("opens on the current slash token after prompt text", () => {
    expect(extractSlashQuery("hello /x")).toBe("x");
  });

  it("stays closed without a current slash token", () => {
    expect(extractSlashQuery("")).toBeNull();
    expect(extractSlashQuery("@file")).toBeNull();
    expect(extractSlashQuery("hello /x next")).toBeNull();
  });
});
