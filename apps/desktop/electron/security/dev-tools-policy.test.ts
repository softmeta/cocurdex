import { describe, expect, it } from "vitest";
import { resolveMainWindowDevTools } from "./dev-tools-policy";

describe("resolveMainWindowDevTools", () => {
  it("enables DevTools in unpackaged (dev) builds", () => {
    expect(resolveMainWindowDevTools({ packaged: false })).toBe(true);
  });

  it("enables DevTools in packaged builds", () => {
    expect(resolveMainWindowDevTools({ packaged: true })).toBe(true);
  });
});
