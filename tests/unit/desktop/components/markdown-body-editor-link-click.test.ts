import { describe, expect, it } from "vitest";
import { resolveLinkClickTarget } from "@/components/markdown-body-editor/link-click";

describe("resolveLinkClickTarget", () => {
  it("opens web and mail links externally", () => {
    expect(
      resolveLinkClickTarget(
        "https://claude.ai/artifact/HApcebMEo3UK6Q6EpNUk7U",
      ),
    ).toEqual({
      kind: "external",
      url: "https://claude.ai/artifact/HApcebMEo3UK6Q6EpNUk7U",
    });
    expect(resolveLinkClickTarget("mailto:team@example.invalid")).toEqual({
      kind: "external",
      url: "mailto:team@example.invalid",
    });
  });

  it("routes cocurdex links to the entity they name", () => {
    expect(resolveLinkClickTarget("cocurdex://issue/abc-1")).toEqual({
      kind: "entity",
      ref: { kind: "issue", id: "abc-1" },
    });
  });

  it("leaves other schemes and relative links to the editor", () => {
    expect(resolveLinkClickTarget("javascript:alert(1)")).toBeNull();
    expect(resolveLinkClickTarget("file:///etc/passwd")).toBeNull();
    expect(resolveLinkClickTarget("note://n1")).toBeNull();
    expect(resolveLinkClickTarget("#section")).toBeNull();
    expect(resolveLinkClickTarget("")).toBeNull();
  });
});
