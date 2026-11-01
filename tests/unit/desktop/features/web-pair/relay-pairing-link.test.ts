import { buildHostPairingLink } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { readRelayPairingLink } from "@/features/web-pair/relay-pairing-link";

const HOST_KEY = "A".repeat(43);
const ROUTE = "B".repeat(22);

function link(address: string) {
  return buildHostPairingLink(address, "123456", HOST_KEY);
}

describe("readRelayPairingLink", () => {
  it("accepts a relay pairing link served over HTTPS", () => {
    const address = `https://relay.example.invalid/v1/connect/${ROUTE}`;
    expect(readRelayPairingLink(link(address), "https:")).toEqual({
      ok: true,
      link: { baseUrl: address, code: "123456", hostKey: HOST_KEY },
    });
  });

  it("refuses a direct computer address so the browser never dials the LAN", () => {
    expect(
      readRelayPairingLink(link("http://192.168.1.20:47300"), "http:"),
    ).toEqual({ ok: false, problem: "notRelay" });
  });

  it("refuses a plain HTTP relay from an HTTPS page", () => {
    const address = `http://relay.example.invalid/v1/connect/${ROUTE}`;
    expect(readRelayPairingLink(link(address), "https:")).toEqual({
      ok: false,
      problem: "insecure",
    });
    expect(readRelayPairingLink(link(address), "http:")).toMatchObject({
      ok: true,
    });
  });

  it("reports text that is not a pairing link", () => {
    expect(readRelayPairingLink("hello", "https:")).toEqual({
      ok: false,
      problem: "invalid",
    });
  });
});
