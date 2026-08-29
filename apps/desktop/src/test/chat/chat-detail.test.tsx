import { describe, expect, it } from "vitest";
import source from "../../../src/features/chat/chat-detail.tsx?raw";

describe("ConversationDetail", () => {
  it("does not call useEffect directly", () => {
    expect(source).not.toMatch(/\buseEffect\s*\(/);
  });
});
