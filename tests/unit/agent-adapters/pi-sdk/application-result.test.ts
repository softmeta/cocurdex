import { applicationToolResult } from "@cocurdex/agent-adapters/internal/pi-sdk/application-result";
import { describe, expect, it } from "vitest";

describe("application tool results", () => {
  it("returns readable content and resource links without copying binary payloads into RPC", () => {
    const result = applicationToolResult({
      content: [
        { type: "text", text: "Notes" },
        { type: "image", data: "synthetic-binary", mimeType: "image/png" },
        {
          type: "resource_link",
          uri: "https://example.invalid/report",
          name: "Report",
        },
      ],
    });
    expect(result.content[0]).toEqual({ type: "text", text: "Notes" });
    expect(result.content[1].text).toContain("https://example.invalid/report");
    expect(result.omittedContent).toBe(1);
    expect(JSON.stringify(result)).not.toContain("synthetic-binary");
  });

  it("bounds text across all content blocks without splitting Unicode code points", () => {
    const result = applicationToolResult({
      content: [
        { type: "text", text: "🙂".repeat(63_999) },
        { type: "text", text: "🙂end" },
        { type: "text", text: "later" },
      ],
      isError: true,
    });
    expect(
      Array.from(result.content.map((item) => item.text).join("")).length,
    ).toBe(64_000);
    expect(result.content[1].text).toBe("🙂");
    expect(result.isError).toBe(true);
    expect(result.omittedContent).toBe(2);
  });
});
