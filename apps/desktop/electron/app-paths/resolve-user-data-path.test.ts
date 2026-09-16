import { COCURDEX_USER_DATA_PATH_ENV } from "@cocurdex/daemon/paths";
import { afterEach, describe, expect, it } from "vitest";
import { resolveUserDataPath } from "./resolve-user-data-path";

describe("resolveUserDataPath", () => {
  afterEach(() => {
    delete process.env[COCURDEX_USER_DATA_PATH_ENV];
  });

  it("honors the COCURDEX_USER_DATA_PATH override for any build flavor", () => {
    process.env[COCURDEX_USER_DATA_PATH_ENV] = "/tmp/cocurdex-isolated";
    const base = "/Users/x/Library/Application Support/Cocurdex";
    expect(resolveUserDataPath(base, false)).toBe("/tmp/cocurdex-isolated");
    expect(resolveUserDataPath(base, true)).toBe("/tmp/cocurdex-isolated");
  });

  it("keeps the default path for packaged builds", () => {
    expect(
      resolveUserDataPath(
        "/Users/x/Library/Application Support/Cocurdex",
        true,
      ),
    ).toBe("/Users/x/Library/Application Support/Cocurdex");
  });

  it("appends a -dev suffix for non-packaged (local dev) builds", () => {
    expect(
      resolveUserDataPath(
        "/Users/x/Library/Application Support/Cocurdex",
        false,
      ),
    ).toBe("/Users/x/Library/Application Support/Cocurdex-dev");
  });

  it("isolates dev data from packaged data so they never share a directory", () => {
    const base = "/Users/x/Library/Application Support/Cocurdex";
    expect(resolveUserDataPath(base, false)).not.toBe(
      resolveUserDataPath(base, true),
    );
  });
});
