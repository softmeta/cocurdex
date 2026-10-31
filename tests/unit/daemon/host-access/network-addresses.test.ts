import { listHostAddresses } from "@cocurdex/daemon/internal/host-access/network-addresses";
import { describe, expect, it } from "vitest";

describe("listHostAddresses", () => {
  it("lists shareable LAN and Tailscale addresses, tailnet first, without loopback, link-local, or proxy TUN addresses", () => {
    const addresses = listHostAddresses(
      {
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
        en0: [
          { address: "192.168.1.20", family: "IPv4", internal: false },
          { address: "fe80::1", family: "IPv6", internal: false },
          { address: "2001:db8::5", family: "IPv6", internal: false },
          { address: "169.254.3.3", family: 4, internal: false },
        ],
        utun9: [{ address: "198.18.0.1", family: "IPv4", internal: false }],
        utun4: [
          { address: "100.101.102.103", family: "IPv4", internal: false },
          { address: "fd7a:115c:a1e0::1", family: 6, internal: false },
        ],
      },
      47820,
    );

    expect(addresses).toEqual([
      {
        address: "100.101.102.103",
        kind: "tailscale",
        url: "http://100.101.102.103:47820",
      },
      {
        address: "fd7a:115c:a1e0::1",
        kind: "tailscale",
        url: "http://[fd7a:115c:a1e0::1]:47820",
      },
      {
        address: "192.168.1.20",
        kind: "lan",
        url: "http://192.168.1.20:47820",
      },
    ]);
  });

  it("does not treat the wider 100.x range outside the tailnet block as Tailscale", () => {
    expect(
      listHostAddresses(
        { eth0: [{ address: "100.1.2.3", family: "IPv4", internal: false }] },
        1,
      )[0]?.kind,
    ).toBe("lan");
  });
});
