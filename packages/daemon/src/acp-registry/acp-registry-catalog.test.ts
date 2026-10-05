import { describe, expect, it } from "vitest";
import {
  getAcpRegistryPlatformKey,
  parseAcpRegistry,
} from "./acp-registry-catalog";

const sha = "a".repeat(64);

function registry(agents: unknown[]) {
  return { version: "1.0.0", agents };
}

describe("parseAcpRegistry", () => {
  it("prefers the platform binary and falls back to a package", () => {
    const entries = parseAcpRegistry(
      registry([
        {
          id: "kilo",
          name: "Kilo",
          version: "7.8.3",
          distribution: {
            binary: {
              "darwin-aarch64": {
                archive: "https://example.com/kilo.zip",
                cmd: "./kilo",
                args: ["acp"],
                sha256: sha.toUpperCase(),
              },
            },
            npx: { package: "@kilocode/cli@7.8.3", args: ["acp"] },
          },
        },
      ]),
      "linux-x86_64",
    );
    expect(entries[0]?.launch).toEqual({
      kind: "npx",
      target: { package: "@kilocode/cli@7.8.3", args: ["acp"], env: {} },
    });

    const [onMac] = parseAcpRegistry(
      registry([
        {
          id: "kilo",
          name: "Kilo",
          version: "7.8.3",
          distribution: {
            binary: {
              "darwin-aarch64": {
                archive: "https://example.com/kilo.zip",
                cmd: "./kilo",
                sha256: sha.toUpperCase(),
              },
            },
          },
        },
      ]),
      "darwin-aarch64",
    );
    expect(onMac?.launch).toMatchObject({
      kind: "binary",
      target: { cmd: "./kilo", sha256: sha },
    });
  });

  it("drops entries that could escape their install path or downgrade transport", () => {
    const entries = parseAcpRegistry(
      registry([
        { id: "../evil", name: "Evil", version: "1.0.0", distribution: {} },
        {
          id: "plain-http",
          name: "Plain",
          version: "1.0.0",
          distribution: {
            binary: {
              "darwin-aarch64": {
                archive: "http://example.com/a.zip",
                cmd: "./a",
              },
            },
          },
        },
        { id: "no-version", name: "No version", distribution: {} },
      ]),
      "darwin-aarch64",
    );
    expect(entries.map((entry) => entry.agent.registryId)).toEqual([
      "plain-http",
    ]);
    expect(entries[0]?.agent.distribution).toBeNull();
  });

  it("ignores malformed checksums instead of trusting them", () => {
    const [entry] = parseAcpRegistry(
      registry([
        {
          id: "agent",
          name: "Agent",
          version: "1.0.0",
          distribution: {
            binary: {
              "darwin-aarch64": {
                archive: "https://example.com/a.tar.gz",
                cmd: "./a",
                sha256: "not-a-hash",
              },
            },
          },
        },
      ]),
      "darwin-aarch64",
    );
    expect(entry?.launch).toMatchObject({ target: { sha256: null } });
  });

  it("rejects a document without an agents list", () => {
    expect(() => parseAcpRegistry({ agents: "nope" })).toThrow();
  });
});

describe("getAcpRegistryPlatformKey", () => {
  it("maps Node platforms to registry keys", () => {
    expect(getAcpRegistryPlatformKey("darwin", "arm64")).toBe("darwin-aarch64");
    expect(getAcpRegistryPlatformKey("win32", "x64")).toBe("windows-x86_64");
    expect(getAcpRegistryPlatformKey("freebsd", "x64")).toBeNull();
  });
});
