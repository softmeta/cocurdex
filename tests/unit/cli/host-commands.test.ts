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

describe("buildPairingLinks", () => {
  it("puts the code in the fragment so it never reaches server logs", () => {
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
      ),
    ).toEqual([
      {
        kind: "tailscale",
        url: "http://[fd7a:115c:a1e0::1]:47820/#pair=abc-_1",
      },
    ]);
  });
});
