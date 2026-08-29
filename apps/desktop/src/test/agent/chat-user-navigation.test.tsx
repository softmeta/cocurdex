import { describe, expect, it } from "vitest";
import source from "../../../src/features/agent/view/chat-user-navigation.tsx?raw";

describe("UserMessageNavigation", () => {
  it("does not call useEffect directly", () => {
    expect(source).not.toMatch(/\buseEffect\s*\(/);
  });
});
