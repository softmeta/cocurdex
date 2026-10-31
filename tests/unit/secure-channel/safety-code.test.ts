import { generateKeyPair, pairingSafetyCode } from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";

describe("pairingSafetyCode", () => {
  const host = generateKeyPair().publicKey;
  const device = generateKeyPair().publicKey;

  it("gives both sides the same six digits for the same pair of keys", () => {
    const code = pairingSafetyCode(host, device);
    expect(code).toMatch(/^\d{6}$/);
    expect(pairingSafetyCode(host.slice(), device.slice())).toBe(code);
  });

  it("changes when either key is replaced", () => {
    const code = pairingSafetyCode(host, device);
    const other = generateKeyPair().publicKey;
    expect(pairingSafetyCode(other, device)).not.toBe(code);
    expect(pairingSafetyCode(host, other)).not.toBe(code);
  });

  it("keeps leading zeros", () => {
    const codes = Array.from({ length: 2000 }, () =>
      pairingSafetyCode(host, generateKeyPair().publicKey),
    );
    expect(codes.every((code) => code.length === 6)).toBe(true);
    expect(codes.some((code) => code.startsWith("0"))).toBe(true);
  });
});
