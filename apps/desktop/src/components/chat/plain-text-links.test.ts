import { describe, expect, it } from "vitest";
import { splitTextByLinks, toLinkHref } from "./plain-text-links";

describe("splitTextByLinks", () => {
  it("returns the whole run as text when there is no URL", () => {
    expect(splitTextByLinks("解读下这个")).toEqual([
      { kind: "text", text: "解读下这个" },
    ]);
  });

  it("keeps a URL where the user placed it", () => {
    expect(
      splitTextByLinks("解读下这个 https://cursor.com/cn/blog/projects"),
    ).toEqual([
      { kind: "text", text: "解读下这个 " },
      { kind: "link", url: "https://cursor.com/cn/blog/projects" },
    ]);
  });

  it("splits text between several URLs", () => {
    expect(splitTextByLinks("a https://one.dev b https://two.dev c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "link", url: "https://one.dev" },
      { kind: "text", text: " b " },
      { kind: "link", url: "https://two.dev" },
      { kind: "text", text: " c" },
    ]);
  });

  it("strips punctuation that belongs to the surrounding prose", () => {
    expect(splitTextByLinks("see https://example.com/a, then go.")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", url: "https://example.com/a" },
      { kind: "text", text: ", then go." },
    ]);
  });

  it("keeps a closing paren that balances one inside the URL", () => {
    expect(
      splitTextByLinks("(https://en.wikipedia.org/wiki/Foo_(bar))"),
    ).toEqual([
      { kind: "text", text: "(" },
      { kind: "link", url: "https://en.wikipedia.org/wiki/Foo_(bar)" },
      { kind: "text", text: ")" },
    ]);
  });

  it("does not treat a scheme glued to a word as a URL", () => {
    expect(splitTextByLinks("xhttps://example.com")).toEqual([
      { kind: "text", text: "xhttps://example.com" },
    ]);
  });

  it("ignores a bare scheme with no host", () => {
    expect(splitTextByLinks("https:// then text")).toEqual([
      { kind: "text", text: "https:// then text" },
    ]);
  });

  it("matches bare www hosts", () => {
    expect(splitTextByLinks("go to www.example.com now")).toEqual([
      { kind: "text", text: "go to " },
      { kind: "link", url: "www.example.com" },
      { kind: "text", text: " now" },
    ]);
  });

  it("stops at full-width punctuation", () => {
    expect(splitTextByLinks("看 https://example.com。")).toEqual([
      { kind: "text", text: "看 " },
      { kind: "link", url: "https://example.com" },
      { kind: "text", text: "。" },
    ]);
  });
});

describe("toLinkHref", () => {
  it("adds a scheme to bare www hosts", () => {
    expect(toLinkHref("www.example.com")).toBe("https://www.example.com");
  });

  it("leaves absolute URLs untouched", () => {
    expect(toLinkHref("https://example.com")).toBe("https://example.com");
  });
});
