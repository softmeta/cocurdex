import {
  buildHostPairingLink,
  buildLocalWebClientUrl,
  parseHostPairingLink,
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

describe("parseHostPairingLink", () => {
  it("reads back the host and code of a built link", () => {
    const link = buildHostPairingLink(
      "http://192.168.1.20:47820/x?y=1",
      "K7-2Q",
    );

    expect(parseHostPairingLink(`  ${link}\n`)).toEqual({
      baseUrl: "http://192.168.1.20:47820",
      code: "K7-2Q",
    });
  });

  it("accepts a link typed through a full-width input method", () => {
    expect(
      parseHostPairingLink(
        "ｈｔｔｐ：／／10。0．2。2：38943／＃pair＝MGG8－9ShH",
      ),
    ).toEqual({ baseUrl: "http://10.0.2.2:38943", code: "MGG8-9ShH" });
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
