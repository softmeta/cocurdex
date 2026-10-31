import {
  isAllowedRemoteHostHeader,
  isAllowedRemoteOrigin,
} from "@cocurdex/daemon/internal/host-access/remote-origin";
import { describe, expect, it } from "vitest";

describe("isAllowedRemoteOrigin", () => {
  it("accepts native clients without an origin and pages served by this host", () => {
    expect(isAllowedRemoteOrigin(undefined, "192.168.1.5:47820")).toBe(true);
    expect(
      isAllowedRemoteOrigin("http://192.168.1.5:47820", "192.168.1.5:47820"),
    ).toBe(true);
    expect(
      isAllowedRemoteOrigin(
        "http://[fd7a:115c:a1e0::1]:47820",
        "[FD7A:115C:A1E0::1]:47820",
      ),
    ).toBe(true);
  });

  it("rejects pages from any other origin, including loopback", () => {
    expect(
      isAllowedRemoteOrigin("http://evil.example", "192.168.1.5:47820"),
    ).toBe(false);
    expect(
      isAllowedRemoteOrigin("http://127.0.0.1:47820", "192.168.1.5:47820"),
    ).toBe(false);
    expect(isAllowedRemoteOrigin("app://cocurdex", "192.168.1.5:47820")).toBe(
      false,
    );
    expect(isAllowedRemoteOrigin("http://192.168.1.5:47820", undefined)).toBe(
      false,
    );
  });
});

describe("isAllowedRemoteHostHeader", () => {
  it("accepts IP literals, this machine's name, mDNS and tailnet names", () => {
    expect(isAllowedRemoteHostHeader("192.168.1.5:47820", "studio")).toBe(true);
    expect(
      isAllowedRemoteHostHeader("[fd7a:115c:a1e0::1]:47820", "studio"),
    ).toBe(true);
    expect(isAllowedRemoteHostHeader("Studio:47820", "studio")).toBe(true);
    expect(isAllowedRemoteHostHeader("studio.local:47820", "x")).toBe(true);
    expect(isAllowedRemoteHostHeader("studio.tail1234.ts.net", "x")).toBe(true);
  });

  it("rejects other DNS names so a rebinding domain cannot reach the listener", () => {
    expect(isAllowedRemoteHostHeader("evil.example:47820", "studio")).toBe(
      false,
    );
    expect(isAllowedRemoteHostHeader(undefined, "studio")).toBe(false);
  });
});
