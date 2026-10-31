import { resolveMainWindowDevTools } from "@desktop/electron/security/dev-tools-policy";
import { describe, expect, it } from "vitest";

describe("resolveMainWindowDevTools", () => {
  it("enables DevTools in unpackaged (dev) builds", () => {
    expect(resolveMainWindowDevTools({ packaged: false })).toBe(true);
  });

  it("enables DevTools in packaged builds", () => {
    expect(resolveMainWindowDevTools({ packaged: true })).toBe(true);
  });
});
