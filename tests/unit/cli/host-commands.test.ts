import {
  buildPairingLinks,
  parseScopesFlag,
} from "@cocurdex/cli/internal/host-commands";
import { describe, expect, it } from "vitest";

describe("parseScopesFlag", () => {
  it("defaults to read, interact and approvals", () => {
    expect(parseScopesFlag(undefined)).toEqual([
      "read",
      "interact",
      "approvals",
    ]);
  });

  it("parses a comma list and rejects unknown scopes", () => {
    expect(parseScopesFlag("read, files.read")).toEqual(["read", "files.read"]);
    expect(() => parseScopesFlag("read,root")).toThrow(/root/);
  });
});

const HOST_KEY = "A".repeat(43);

describe("buildPairingLinks", () => {
  it("puts the code and host key in the fragment so they never reach server logs", () => {
    expect(
      buildPairingLinks(
        [
          {
            address: "fd7a:115c:a1e0::1",
            kind: "tailscale",
            url: "http://[fd7a:115c:a1e0::1]:47820",
          },
        ],
        "abc-_1",
        HOST_KEY,
      ),
    ).toEqual([
      {
        kind: "tailscale",
        url: `http://[fd7a:115c:a1e0::1]:47820/#pair=abc-_1&hk=${HOST_KEY}`,
      },
    ]);
  });
});
