import { describe, expect, it } from "vitest";
import source from "../../../src/features/agent/tool-call/subagent-session-detail.tsx?raw";

describe("ReadonlySubagentSession", () => {
  it("does not call useEffect directly", () => {
    expect(source).not.toMatch(/\buseEffect\s*\(/);
  });
});
