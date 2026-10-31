import {
  buildHostPairingLink,
  buildLocalWebClientUrl,
  buildRelayEndpoint,
  hostEndpointBase,
  normalizeRelayUrl,
  parseHostPairingLink,
  parseRelayCredential,
} from "@cocurdex/shared/internal/host-access";
import { describe, expect, it } from "vitest";

describe("buildLocalWebClientUrl", () => {
  it("keeps the token in the fragment so it never reaches the server", () => {
    const url = new URL(
      buildLocalWebClientUrl("ws://127.0.0.1:53508", "a b+c"),
    );
    expect(url.origin).toBe("http://127.0.0.1:53508");
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe("a b+c");
  });

  it("serves over https when the daemon socket is secure", () => {
    const url = new URL(buildLocalWebClientUrl("wss://host.local:443", "t"));
    expect(url.protocol).toBe("https:");
  });
});

const HOST_KEY = "A".repeat(43);

describe("parseHostPairingLink", () => {
  it("reads back the host, code, and host key of a built link", () => {
    const link = buildHostPairingLink(
      "http://192.168.1.20:47820/x?y=1",
      "K7-2Q",
      HOST_KEY,
    );

    expect(parseHostPairingLink(`  ${link}\n`)).toEqual({
      baseUrl: "http://192.168.1.20:47820",
      code: "K7-2Q",
      hostKey: HOST_KEY,
    });
  });

  it("rejects a link without a well-formed host key", () => {
    expect(
      parseHostPairingLink("http://host.local:47820/#pair=abc"),
    ).toBeNull();
    expect(
      parseHostPairingLink("http://host.local:47820/#pair=abc&hk=short"),
    ).toBeNull();
  });

  it("accepts a link typed through a full-width input method", () => {
    expect(
      parseHostPairingLink(
        `ｈｔｔｐ：／／10。0．2。2：38943／＃pair＝MGG8－9ShH&hk=${HOST_KEY}`,
      ),
    ).toEqual({
      baseUrl: "http://10.0.2.2:38943",
      code: "MGG8-9ShH",
      hostKey: HOST_KEY,
    });
  });

  it("rejects links without a code or with another scheme", () => {
    expect(parseHostPairingLink("http://host.local:47820/")).toBeNull();
    expect(
      parseHostPairingLink("http://host.local:47820/#pair=%20"),
    ).toBeNull();
    expect(parseHostPairingLink("cocurdex://host#pair=abc")).toBeNull();
    expect(parseHostPairingLink("not a link")).toBeNull();
  });
});

const ROUTE_ID = "R".repeat(22);

describe("relay endpoints", () => {
  it("keep the relay route while direct addresses reduce to their origin", () => {
    const relay = normalizeRelayUrl(" https://relay.example.invalid/eu/ ");
    expect(relay).toBe("https://relay.example.invalid/eu");
    const endpoint = buildRelayEndpoint(relay ?? "", ROUTE_ID);

    expect(hostEndpointBase(`${endpoint}/`)).toBe(endpoint);
    expect(hostEndpointBase("http://10.0.0.5:47820/v1/other")).toBe(
      "http://10.0.0.5:47820",
    );
    expect(normalizeRelayUrl("wss://relay.example.invalid")).toBeNull();
    expect(normalizeRelayUrl("https://u:p@relay.example.invalid")).toBeNull();
  });

  it("round-trips a pairing link through the relay", () => {
    const endpoint = buildRelayEndpoint(
      "https://relay.example.invalid",
      ROUTE_ID,
    );
    const link = buildHostPairingLink(endpoint, "K7-2Q", HOST_KEY);

    expect(parseHostPairingLink(link)).toEqual({
      baseUrl: endpoint,
      code: "K7-2Q",
      hostKey: HOST_KEY,
    });
  });

  it("accepts only complete relay credentials", () => {
    const credential = {
      accountId: "invite-7",
      expiresAt: 1_900_000_000,
      signature: "s".repeat(86),
    };
    expect(
      parseRelayCredential(JSON.stringify({ ...credential, extra: 1 })),
    ).toEqual(credential);
    expect(
      parseRelayCredential(JSON.stringify({ ...credential, signature: "s" })),
    ).toBeNull();
    expect(parseRelayCredential("{")).toBeNull();
  });
});
