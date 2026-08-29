import { describe, expect, it } from "vitest";
import source from "../../../src/features/terminal/terminal-search-overlay.tsx?raw";

describe("TerminalSearchOverlay", () => {
  it("does not call useEffect directly", () => {
    expect(source).not.toMatch(/\buseEffect\s*\(/);
  });
});
