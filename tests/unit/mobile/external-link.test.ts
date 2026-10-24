import { externalLinkUrl } from "@cocurdex/mobile/internal/session-detail/external-link";
import { describe, expect, it } from "vitest";

describe("externalLinkUrl", () => {
  it.each([
    "https://example.invalid/docs",
    "http://192.168.1.4:3000/",
    "mailto:team@example.invalid",
    "  HTTPS://example.invalid  ",
  ])("opens %s", (url) => {
    expect(externalLinkUrl(url)).toBe(url.trim());
  });

  it.each([
    "javascript:alert(1)",
    "intent://scan/#Intent;scheme=zxing;end",
    "file:///etc/hosts",
    "tel:+15555550100",
    "sms:+15555550100",
    "cocurdex://session/s1",
    "data:text/html,<b>hi</b>",
    "src/cart.ts",
    "",
  ])("refuses %s", (url) => {
    expect(externalLinkUrl(url)).toBeNull();
  });
});
