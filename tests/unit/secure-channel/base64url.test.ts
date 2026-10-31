import { decodeBase64Url, encodeBase64Url } from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";

describe("base64url", () => {
  it("matches Node's encoding for every length remainder", () => {
    for (let length = 0; length < 40; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, index) => index * 37);
      const expected = Buffer.from(bytes).toString("base64url");
      expect(encodeBase64Url(bytes)).toBe(expected);
      expect(decodeBase64Url(expected)).toEqual(bytes);
    }
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => decodeBase64Url("ab+/")).toThrow();
    expect(() => decodeBase64Url("abcde")).toThrow();
  });
});
