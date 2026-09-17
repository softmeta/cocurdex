import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_UPDATE_CHANNEL,
  isAppUpdateChannel,
  isPrereleaseVersion,
  parseStoredAppUpdateChannel,
  updaterConfigForChannel,
} from "./app-update-channel";

describe("isAppUpdateChannel", () => {
  it("accepts only stable and test", () => {
    expect(isAppUpdateChannel("stable")).toBe(true);
    expect(isAppUpdateChannel("test")).toBe(true);
    expect(isAppUpdateChannel("beta")).toBe(false);
    expect(isAppUpdateChannel("latest")).toBe(false);
  });
});

describe("parseStoredAppUpdateChannel", () => {
  it("reads an object payload", () => {
    expect(parseStoredAppUpdateChannel('{"channel":"test"}')).toBe("test");
    expect(parseStoredAppUpdateChannel('{"channel":"stable"}')).toBe("stable");
  });

  it("reads a bare channel string", () => {
    expect(parseStoredAppUpdateChannel('"test"')).toBe("test");
  });

  it("falls back to stable for junk", () => {
    expect(parseStoredAppUpdateChannel("")).toBe(DEFAULT_APP_UPDATE_CHANNEL);
    expect(parseStoredAppUpdateChannel("{")).toBe(DEFAULT_APP_UPDATE_CHANNEL);
    expect(parseStoredAppUpdateChannel('{"channel":"beta"}')).toBe(
      DEFAULT_APP_UPDATE_CHANNEL,
    );
    expect(parseStoredAppUpdateChannel("null")).toBe(
      DEFAULT_APP_UPDATE_CHANNEL,
    );
  });
});

describe("isPrereleaseVersion", () => {
  it("detects semver prerelease identifiers", () => {
    expect(isPrereleaseVersion("0.1.41")).toBe(false);
    expect(isPrereleaseVersion("0.1.41-beta.1")).toBe(true);
    expect(isPrereleaseVersion("0.1.41-test.2")).toBe(true);
  });
});

describe("updaterConfigForChannel", () => {
  it("points the test channel at GitHub prereleases", () => {
    expect(updaterConfigForChannel("test", "0.1.40")).toEqual({
      allowDowngrade: true,
      allowPrerelease: true,
      feedChannel: "beta",
    });
  });

  it("keeps stable on production releases", () => {
    expect(updaterConfigForChannel("stable", "0.1.40")).toEqual({
      allowDowngrade: false,
      allowPrerelease: false,
      feedChannel: "latest",
    });
  });

  it("allows downgrade when a test build switches back to stable", () => {
    expect(updaterConfigForChannel("stable", "0.1.41-beta.1")).toEqual({
      allowDowngrade: true,
      allowPrerelease: false,
      feedChannel: "latest",
    });
  });
});
